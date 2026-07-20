import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MetricsService } from './metrics.service';
import { RoomsService, type RoomRow, type Feature } from './rooms.service';
import { TokenService } from './token.service';

type Ctx = { roomId: string; participantId: string; name?: string; role?: string };
const MAX_BODY = 4000; // 채팅 본문 길이 상한(저장 폭주 방지)

/**
 * 범용 실시간 룸 게이트웨이 — 채팅·화이트보드·음성(WebRTC 시그널).
 * 접속 토큰이 룸/참가자를 고정하므로 payload 의 roomId 를 신뢰하지 않고 토큰 값만 사용.
 * 시간창(opens/closes)·기능 플래그(features)로 게이팅. 창 밖/기능 off 면 쓰기 거부.
 */
@WebSocketGateway({ path: '/api/rt/v1/socket.io', cors: { origin: true, credentials: true } })
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('RoomsRT');
  @WebSocketServer() server!: Server;
  private readonly windows = new Map<string, { restricted: boolean; opensMs: number; closesMs: number; features: RoomRow['features']; lecture: boolean }>();
  // 접속자(참가자별 소켓 수) — 채팅·화이트보드·음성이 각각 소켓을 열어도 참가자 단위로 집계.
  private readonly presence = new Map<string, Map<string, number>>();
  // 참가자 표시정보(이름·역할) — roster(참석자 명단) 브로드캐스트용. key=`${roomId}:${pid}`.
  private readonly pinfo = new Map<string, { name?: string; role?: string }>();
  // 서버발 강제 종료 예약(룸당 1회). 다중 인스턴스에선 인스턴스별 예약 → 클라 멱등 처리로 중복 무해.
  private readonly closeTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly svc: RoomsService, private readonly tokens: TokenService, private readonly metrics: MetricsService) {}

  async handleConnection(client: Socket) {
    try {
      const token = (client.handshake.auth?.token as string) || (client.handshake.query?.token as string);
      const payload = this.tokens.verify(token);
      if (!payload) { client.emit('error', { message: '인증 실패' }); client.disconnect(true); return; }
      // ctx 는 await 이전에 동기 설정 — 그래야 곧바로 도착하는 메시지 핸들러가 ctx 를 본다(경쟁 방지).
      const ctx: Ctx = { roomId: payload.roomId, participantId: payload.participantId, name: payload.name };
      client.data.ctx = ctx;
      client.join(`room:${ctx.roomId}`);
      this.pinfo.set(`${ctx.roomId}:${ctx.participantId}`, { name: ctx.name }); // 역할은 아래에서 채움
      const isNew = this.addPresence(ctx.roomId, ctx.participantId);
      this.metrics.wsConnections.inc();
      // epoch 폐기 검증(비동기) — 실패 시 강제 해제(handleDisconnect 가 presence·게이지 정리).
      const room = await this.svc.getRoom(payload.roomId);
      if (!room || room.token_epoch !== payload.epoch) { client.emit('error', { message: '폐기되었거나 없는 룸' }); client.disconnect(true); return; }
      this.remember(room);
      // 역할(서버 권위) 적재 — 강의 모드 판서 게이팅에 사용. 위조 불가.
      const role = await this.svc.getParticipantRole(ctx.roomId, ctx.participantId);
      ctx.role = role ?? undefined;
      this.pinfo.set(`${ctx.roomId}:${ctx.participantId}`, { name: ctx.name, role: ctx.role });
      // 참석자 명단(roster) — 이 참가자가 새로 온라인일 때만 1회 방송.
      if (isNew) this.server.to(`room:${ctx.roomId}`).emit('roster:join', { participantId: ctx.participantId, name: ctx.name, role: ctx.role ?? 'viewer' });
    } catch { client.disconnect(true); }
  }
  handleDisconnect(client: Socket) {
    const ctx = client.data.ctx as Ctx | undefined;
    if (ctx) {
      const wasLast = this.removePresence(ctx.roomId, ctx.participantId);
      this.metrics.wsConnections.dec();
      if (wasLast) {
        this.pinfo.delete(`${ctx.roomId}:${ctx.participantId}`);
        this.server.to(`room:${ctx.roomId}`).emit('roster:leave', { participantId: ctx.participantId });
      }
    }
  }
  private ctx(client: Socket): Ctx { return client.data.ctx as Ctx; }

  // ── 접속자(presence) ──
  private addPresence(roomId: string, pid: string): boolean {
    let m = this.presence.get(roomId); if (!m) { m = new Map(); this.presence.set(roomId, m); }
    const n = (m.get(pid) ?? 0) + 1; m.set(pid, n);
    if (n === 1) this.emitPresence(roomId); // 이 참가자가 새로 온라인
    return n === 1;
  }
  private removePresence(roomId: string, pid: string): boolean {
    const m = this.presence.get(roomId); if (!m) return false;
    const n = (m.get(pid) ?? 0) - 1;
    let last = false;
    if (n <= 0) { m.delete(pid); this.emitPresence(roomId); last = true; } else m.set(pid, n);
    if (m.size === 0) this.presence.delete(roomId);
    return last;
  }
  private emitPresence(roomId: string) {
    const online = [...(this.presence.get(roomId)?.keys() ?? [])];
    this.server.to(`room:${roomId}`).emit('presence', { online });
  }

  private remember(room: RoomRow) {
    const w = this.svc.sessionWindow(room);
    this.windows.set(room.id, { restricted: w.restricted, opensMs: w.opensAt?.getTime() ?? 0, closesMs: w.closesAt?.getTime() ?? 0, features: room.features, lecture: this.svc.lectureMode(room) });
    this.scheduleClose(room.id);
  }

  // 강의 모드 판서 권한: 비강의 룸은 누구나, 강의 룸은 host/presenter 만(서버 권위).
  private canDraw(client: Socket): boolean {
    const c = this.ctx(client);
    if (!this.windows.get(c.roomId)?.lecture) return true;
    return c.role === 'host' || c.role === 'presenter';
  }
  // roster(참석자 명단) — 현재 온라인 참가자 + 이름/역할.
  private rosterOf(roomId: string) {
    return [...(this.presence.get(roomId)?.keys() ?? [])].map((pid) => {
      const info = this.pinfo.get(`${roomId}:${pid}`);
      return { participantId: pid, name: info?.name, role: info?.role ?? 'viewer' };
    });
  }

  /** 토큰 폐기 시 호출 — 방에 통지 후 현재 접속 강제 해제, 캐시 정리. */
  async revokeRoom(roomId: string) {
    const room = `room:${roomId}`;
    this.server.to(room).emit('session:revoked', { roomId });
    for (const s of await this.server.in(room).fetchSockets()) s.disconnect(true);
    this.windows.delete(roomId);
    this.presence.delete(roomId);
    const t = this.closeTimers.get(roomId); if (t) { clearTimeout(t); this.closeTimers.delete(roomId); }
  }
  /** 폐장 시각에 방 전체로 session:closed 브로드캐스트(유휴 상대도 열람 전용 전환). */
  private scheduleClose(roomId: string) {
    const w = this.windows.get(roomId);
    if (!w || !w.restricted || this.closeTimers.has(roomId)) return;
    const delay = w.closesMs - Date.now();
    if (delay <= 0) return; // 이미 종료 — 쓰기 거부로 충분
    const t = setTimeout(() => {
      this.closeTimers.delete(roomId);
      this.server.to(`room:${roomId}`).emit('session:closed', { roomId, at: new Date(w.closesMs).toISOString() });
    }, Math.min(delay, 2 ** 31 - 1));
    if (typeof t.unref === 'function') t.unref();
    this.closeTimers.set(roomId, t);
  }
  private openNow(roomId: string): boolean {
    const w = this.windows.get(roomId);
    if (!w || !w.restricted) return true;
    const now = Date.now();
    return now >= w.opensMs && now <= w.closesMs;
  }
  private featureOn(roomId: string, f: Feature): boolean {
    const w = this.windows.get(roomId);
    return !w || w.features?.[f] !== false;
  }
  private room(client: Socket) { return `room:${this.ctx(client).roomId}`; }

  @SubscribeMessage('join')
  async join(@ConnectedSocket() client: Socket) {
    const c = this.ctx(client);
    const room = await this.svc.getRoom(c.roomId);
    if (!room) return { ok: false, error: 'room not found' };
    this.remember(room);
    client.join(this.room(client));
    const hist = this.svc.featureOn(room, 'chat') ? await this.svc.history(c.roomId, c.participantId) : { messages: [], nextCursor: null, hasMore: false };
    const read = await this.svc.markRead(c.roomId, c.participantId);
    if (read.count > 0) client.to(this.room(client)).emit('chat:read', { readerId: read.readerId, at: read.at });
    const online = [...(this.presence.get(c.roomId)?.keys() ?? [])];
    return { ok: true, participantId: c.participantId, features: room.features, session: this.svc.sessionInfo(room), messages: hist.messages, nextCursor: hist.nextCursor, hasMore: hist.hasMore, online, role: c.role ?? 'viewer', mode: this.windows.get(c.roomId)?.lecture ? 'lecture' : 'session', roster: this.rosterOf(c.roomId) };
  }

  /** 이전(오래된) 메시지 페이지 로드 — 무한 스크롤. { before?, limit? } → { messages, nextCursor, hasMore }. */
  @SubscribeMessage('chat:history')
  async chatHistory(@ConnectedSocket() client: Socket, @MessageBody() { before, limit }: { before?: string; limit?: number }) {
    const c = this.ctx(client);
    if (!this.featureOn(c.roomId, 'chat')) return { ok: false };
    const hist = await this.svc.history(c.roomId, c.participantId, { before, limit });
    return { ok: true, ...hist };
  }

  // ── 채팅 ──
  /** 입력 중 표시 — mode='voice' 는 음성 녹음 중 표시. */
  @SubscribeMessage('chat:typing')
  chatTyping(@ConnectedSocket() client: Socket, @MessageBody() { typing, mode }: { typing: boolean; mode?: string }) {
    const c = this.ctx(client);
    client.to(this.room(client)).emit('chat:typing', { participantId: c.participantId, typing: !!typing, mode: mode === 'voice' ? 'voice' : undefined });
    return { ok: true };
  }

  @SubscribeMessage('chat:read')
  async chatRead(@ConnectedSocket() client: Socket) {
    const c = this.ctx(client);
    const read = await this.svc.markRead(c.roomId, c.participantId);
    if (read.count > 0) client.to(this.room(client)).emit('chat:read', { readerId: read.readerId, at: read.at });
    return { ok: true, count: read.count };
  }

  @SubscribeMessage('chat:send')
  async chatSend(@ConnectedSocket() client: Socket, @MessageBody() { body, fileUrl, kind, replyToId }: { body?: string; fileUrl?: string; kind?: string; replyToId?: string }) {
    const c = this.ctx(client);
    if (!this.featureOn(c.roomId, 'chat')) return { ok: false, error: '채팅이 비활성화된 룸입니다.' };
    if (!this.openNow(c.roomId)) return { ok: false, closed: true, error: '룸 활성 시간이 아닙니다.' };
    if (body && body.length > MAX_BODY) return { ok: false, error: `메시지가 너무 깁니다(최대 ${MAX_BODY}자).` };
    if (!body?.trim() && !fileUrl) return { ok: false };
    const k = kind || (fileUrl ? 'file' : 'text');
    const msg = await this.svc.saveMessage(c.roomId, c.participantId, k, body?.trim() || null, fileUrl ?? null, replyToId ?? null);
    const sockets = await this.server.in(this.room(client)).fetchSockets();
    for (const s of sockets) {
      const viewer = (s.data.ctx as Ctx | undefined)?.participantId;
      s.emit('chat:message', { ...msg, mine: msg.senderId === viewer });
    }
    return { ok: true, id: msg.id };
  }

  /** 메시지 삭제(회수) — 본인 발신만, soft delete(원문 보존). 방 전체에 통지. */
  @SubscribeMessage('chat:delete')
  async chatDelete(@ConnectedSocket() client: Socket, @MessageBody() { messageId }: { messageId: string }) {
    const c = this.ctx(client);
    if (!this.featureOn(c.roomId, 'chat')) return { ok: false };
    if (!this.openNow(c.roomId)) return { ok: false, closed: true };
    if (!messageId) return { ok: false };
    const done = await this.svc.deleteMessage(c.roomId, c.participantId, messageId);
    if (!done) return { ok: false, error: '본인이 보낸 메시지만 삭제할 수 있습니다.' };
    this.server.to(this.room(client)).emit('chat:deleted', { messageId });
    return { ok: true };
  }

  @SubscribeMessage('chat:react')
  async chatReact(@ConnectedSocket() client: Socket, @MessageBody() { messageId, emoji }: { messageId: string; emoji: string }) {
    const c = this.ctx(client);
    if (!this.featureOn(c.roomId, 'chat')) return { ok: false };
    if (!this.openNow(c.roomId)) return { ok: false, closed: true };
    if (!emoji || emoji.length > 8 || !messageId) return { ok: false };
    const reactions = await this.svc.toggleReaction(c.roomId, messageId, c.participantId, emoji);
    if (reactions === null) return { ok: false };
    this.server.to(this.room(client)).emit('chat:reaction', { messageId, reactions });
    return { ok: true, reactions };
  }

  // ── 화이트보드 ──
  @SubscribeMessage('wb:join')
  async wbJoin(@ConnectedSocket() client: Socket) {
    const c = this.ctx(client);
    const room = await this.svc.getRoom(c.roomId);
    if (!room) return { ok: false };
    if (!this.svc.featureOn(room, 'whiteboard')) return { ok: false, error: '화이트보드가 비활성화된 룸입니다.' };
    this.remember(room);
    client.join(this.room(client));
    const snap = await this.svc.latestSnapshot(c.roomId);
    const lecture = this.windows.get(c.roomId)?.lecture ?? false;
    return { ok: true, strokes: snap?.strokes ?? [], backgroundUrl: snap?.background_url ?? null, session: this.svc.sessionInfo(room), mode: lecture ? 'lecture' : 'session', role: c.role ?? 'viewer', roster: this.rosterOf(c.roomId) };
  }
  @SubscribeMessage('wb:image')
  wbImage(@ConnectedSocket() client: Socket, @MessageBody() { fileUrl, page, pageCount }: { fileUrl: string | null; page?: number; pageCount?: number }) {
    const c = this.ctx(client);
    if (!this.featureOn(c.roomId, 'whiteboard') || !this.openNow(c.roomId)) return { ok: false, closed: true };
    if (!this.canDraw(client)) return { ok: false, role: 'viewer' }; // 강의 모드: 학생은 배경 변경 불가
    client.to(this.room(client)).emit('wb:image', { fileUrl, page, pageCount });
    return { ok: true };
  }
  @SubscribeMessage('wb:stroke')
  wbStroke(@ConnectedSocket() client: Socket, @MessageBody() { stroke, sid }: { stroke: unknown; sid?: string }) {
    const c = this.ctx(client);
    if (!this.featureOn(c.roomId, 'whiteboard') || !this.openNow(c.roomId)) return { ok: false, closed: true };
    if (!this.canDraw(client)) return { ok: false, role: 'viewer' }; // 강의 모드: host/presenter 만 판서
    client.to(this.room(client)).emit('wb:stroke', { stroke, sid });
    return { ok: true };
  }
  @SubscribeMessage('wb:stroke:partial')
  wbPartial(@ConnectedSocket() client: Socket, @MessageBody() { sid, meta, points }: { sid: string; meta: unknown; points: unknown }) {
    const c = this.ctx(client);
    if (!this.featureOn(c.roomId, 'whiteboard') || !this.openNow(c.roomId)) return;
    if (!this.canDraw(client)) return; // 강의 모드: 학생 발신 무시
    client.to(this.room(client)).emit('wb:stroke:partial', { sid, meta, points });
  }
  @SubscribeMessage('wb:clear')
  wbClear(@ConnectedSocket() client: Socket) {
    const c = this.ctx(client);
    if (!this.featureOn(c.roomId, 'whiteboard') || !this.openNow(c.roomId)) return { ok: false, closed: true };
    if (!this.canDraw(client)) return { ok: false, role: 'viewer' }; // 강의 모드: 학생은 지우기 불가
    client.to(this.room(client)).emit('wb:clear', {});
    return { ok: true };
  }
  // 전체 스트로크 재동기화(되돌리기·필기만 지우기 등 벌크 변경) — 발신자가 계산한 최종 집합을 방에 반영.
  @SubscribeMessage('wb:sync')
  wbSync(@ConnectedSocket() client: Socket, @MessageBody() { strokes }: { strokes: unknown }) {
    const c = this.ctx(client);
    if (!this.featureOn(c.roomId, 'whiteboard') || !this.openNow(c.roomId)) return { ok: false, closed: true };
    if (!this.canDraw(client)) return { ok: false, role: 'viewer' };
    client.to(this.room(client)).emit('wb:sync', { strokes });
    return { ok: true };
  }
  // 안내선(모눈/줄) 모드 동기화 — 세션 한정(스냅샷 저장 안 함).
  @SubscribeMessage('wb:grid')
  wbGrid(@ConnectedSocket() client: Socket, @MessageBody() { grid }: { grid: string }) {
    const c = this.ctx(client);
    if (!this.featureOn(c.roomId, 'whiteboard') || !this.openNow(c.roomId)) return;
    if (!this.canDraw(client)) return; // 강의 모드: 학생 변경 무시
    client.to(this.room(client)).emit('wb:grid', { grid });
  }
  // 레이저 포인터 — 비영구(저장 안 함). 잠깐 보여주고 사라지는 궤적만 중계.
  @SubscribeMessage('wb:laser')
  wbLaser(@ConnectedSocket() client: Socket, @MessageBody() { sid, points }: { sid: string; points: unknown }) {
    const c = this.ctx(client);
    if (!this.featureOn(c.roomId, 'whiteboard') || !this.openNow(c.roomId)) return;
    if (!this.canDraw(client)) return; // 강의 모드: 학생 레이저 무시
    client.to(this.room(client)).emit('wb:laser', { participantId: c.participantId, sid, points });
  }
  @SubscribeMessage('wb:save')
  async wbSave(@ConnectedSocket() client: Socket, @MessageBody() { strokes, backgroundUrl }: { strokes: unknown; backgroundUrl?: string | null }) {
    const c = this.ctx(client);
    if (!this.featureOn(c.roomId, 'whiteboard') || !this.openNow(c.roomId)) return { ok: false, closed: true };
    if (!this.canDraw(client)) return { ok: false, role: 'viewer' }; // 강의 모드: host 만 스냅샷 저장
    await this.svc.saveSnapshot(c.roomId, c.participantId, strokes, backgroundUrl);
    return { ok: true };
  }

  // ── 강의 상호작용(발표권 위임·손들기) ──
  // 발표권 부여 — host 만. DB role 을 presenter 로 바꾸고 방에 알림(대상 클라가 lecture:sync 로 ctx 갱신).
  @SubscribeMessage('lecture:grant')
  async lectureGrant(@ConnectedSocket() client: Socket, @MessageBody() { participantId }: { participantId: string }) {
    const c = this.ctx(client);
    if (c.role !== 'host') return { ok: false, error: 'host 만 발표권을 줄 수 있습니다.' };
    await this.svc.setParticipantRole(c.roomId, participantId, 'presenter');
    const info = this.pinfo.get(`${c.roomId}:${participantId}`); if (info) info.role = 'presenter';
    this.server.to(this.room(client)).emit('lecture:role', { participantId, role: 'presenter' });
    return { ok: true };
  }
  // 발표권 회수 — host 만.
  @SubscribeMessage('lecture:revoke')
  async lectureRevoke(@ConnectedSocket() client: Socket, @MessageBody() { participantId }: { participantId: string }) {
    const c = this.ctx(client);
    if (c.role !== 'host') return { ok: false, error: 'host 만 회수할 수 있습니다.' };
    await this.svc.setParticipantRole(c.roomId, participantId, 'viewer');
    const info = this.pinfo.get(`${c.roomId}:${participantId}`); if (info) info.role = 'viewer';
    this.server.to(this.room(client)).emit('lecture:role', { participantId, role: 'viewer' });
    return { ok: true };
  }
  // 내 역할 재동기화 — DB role 을 다시 읽어 ctx.role 갱신(발표권 변경 후 대상 클라가 호출).
  @SubscribeMessage('lecture:sync')
  async lectureSync(@ConnectedSocket() client: Socket) {
    const c = this.ctx(client);
    const role = await this.svc.getParticipantRole(c.roomId, c.participantId);
    c.role = role ?? undefined;
    return { ok: true, role: c.role ?? 'viewer' };
  }
  // 손들기 — 방 전체에 알림(host 가 발표권을 줄 판단). 상태만 전달(멱등).
  @SubscribeMessage('hand:raise')
  handRaise(@ConnectedSocket() client: Socket, @MessageBody() { raised }: { raised?: boolean }) {
    const c = this.ctx(client);
    client.to(this.room(client)).emit('hand:raise', { participantId: c.participantId, name: c.name, raised: !!raised });
    return { ok: true };
  }

  // ── 음성(WebRTC 시그널 중계) ──
  @SubscribeMessage('call:join')
  async callJoin(@ConnectedSocket() client: Socket) {
    const c = this.ctx(client);
    const room = await this.svc.getRoom(c.roomId);
    if (!room) return { ok: false };
    if (!this.svc.featureOn(room, 'voice')) return { ok: false, error: '음성이 비활성화된 룸입니다.' };
    this.remember(room);
    if (!this.svc.sessionOpen(room)) return { ok: false, closed: true };
    client.join(this.room(client));
    client.to(this.room(client)).emit('call:peer-join', { participantId: c.participantId });
    return { ok: true };
  }
  @SubscribeMessage('call:signal')
  callSignal(@ConnectedSocket() client: Socket, @MessageBody() { kind, data }: { kind: 'offer' | 'answer' | 'ice'; data: unknown }) {
    const c = this.ctx(client);
    if (!this.featureOn(c.roomId, 'voice') || !this.openNow(c.roomId)) return { ok: false, closed: true };
    client.to(this.room(client)).emit('call:signal', { from: c.participantId, kind, data });
    return { ok: true };
  }
  @SubscribeMessage('call:leave')
  callLeave(@ConnectedSocket() client: Socket) {
    const c = this.ctx(client);
    client.to(this.room(client)).emit('call:peer-leave', { participantId: c.participantId });
    return { ok: true };
  }
}
