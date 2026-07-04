import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RoomsService, type RoomRow, type Feature } from './rooms.service';
import { TokenService } from './token.service';

type Ctx = { roomId: string; participantId: string; name?: string };
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
  private readonly windows = new Map<string, { restricted: boolean; opensMs: number; closesMs: number; features: RoomRow['features'] }>();
  // 접속자(참가자별 소켓 수) — 채팅·화이트보드·음성이 각각 소켓을 열어도 참가자 단위로 집계.
  private readonly presence = new Map<string, Map<string, number>>();
  // 서버발 강제 종료 예약(룸당 1회). 다중 인스턴스에선 인스턴스별 예약 → 클라 멱등 처리로 중복 무해.
  private readonly closeTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly svc: RoomsService, private readonly tokens: TokenService) {}

  handleConnection(client: Socket) {
    const token = (client.handshake.auth?.token as string) || (client.handshake.query?.token as string);
    const payload = this.tokens.verify(token);
    if (!payload) { client.emit('error', { message: '인증 실패' }); client.disconnect(true); return; }
    const ctx: Ctx = { roomId: payload.roomId, participantId: payload.participantId, name: payload.name };
    client.data.ctx = ctx;
    client.join(`room:${ctx.roomId}`); // 토큰이 룸을 고정 → 접속 즉시 방 참여(presence·중계 대상)
    this.addPresence(ctx.roomId, ctx.participantId);
  }
  handleDisconnect(client: Socket) {
    const ctx = client.data.ctx as Ctx | undefined;
    if (ctx) this.removePresence(ctx.roomId, ctx.participantId);
  }
  private ctx(client: Socket): Ctx { return client.data.ctx as Ctx; }

  // ── 접속자(presence) ──
  private addPresence(roomId: string, pid: string) {
    let m = this.presence.get(roomId); if (!m) { m = new Map(); this.presence.set(roomId, m); }
    const n = (m.get(pid) ?? 0) + 1; m.set(pid, n);
    if (n === 1) this.emitPresence(roomId); // 이 참가자가 새로 온라인
  }
  private removePresence(roomId: string, pid: string) {
    const m = this.presence.get(roomId); if (!m) return;
    const n = (m.get(pid) ?? 0) - 1;
    if (n <= 0) { m.delete(pid); this.emitPresence(roomId); } else m.set(pid, n);
    if (m.size === 0) this.presence.delete(roomId);
  }
  private emitPresence(roomId: string) {
    const online = [...(this.presence.get(roomId)?.keys() ?? [])];
    this.server.to(`room:${roomId}`).emit('presence', { online });
  }

  private remember(room: RoomRow) {
    const w = this.svc.sessionWindow(room);
    this.windows.set(room.id, { restricted: w.restricted, opensMs: w.opensAt?.getTime() ?? 0, closesMs: w.closesAt?.getTime() ?? 0, features: room.features });
    this.scheduleClose(room.id);
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
    const messages = this.svc.featureOn(room, 'chat') ? await this.svc.history(c.roomId, c.participantId) : [];
    const read = await this.svc.markRead(c.roomId, c.participantId);
    if (read.count > 0) client.to(this.room(client)).emit('chat:read', { readerId: read.readerId, at: read.at });
    const online = [...(this.presence.get(c.roomId)?.keys() ?? [])];
    return { ok: true, participantId: c.participantId, features: room.features, session: this.svc.sessionInfo(room), messages, online };
  }

  // ── 채팅 ──
  @SubscribeMessage('chat:typing')
  chatTyping(@ConnectedSocket() client: Socket, @MessageBody() { typing }: { typing: boolean }) {
    const c = this.ctx(client);
    client.to(this.room(client)).emit('chat:typing', { participantId: c.participantId, typing: !!typing });
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
    return { ok: true, strokes: snap?.strokes ?? [], backgroundUrl: snap?.background_url ?? null, session: this.svc.sessionInfo(room) };
  }
  @SubscribeMessage('wb:image')
  wbImage(@ConnectedSocket() client: Socket, @MessageBody() { fileUrl, page, pageCount }: { fileUrl: string | null; page?: number; pageCount?: number }) {
    const c = this.ctx(client);
    if (!this.featureOn(c.roomId, 'whiteboard') || !this.openNow(c.roomId)) return { ok: false, closed: true };
    client.to(this.room(client)).emit('wb:image', { fileUrl, page, pageCount });
    return { ok: true };
  }
  @SubscribeMessage('wb:stroke')
  wbStroke(@ConnectedSocket() client: Socket, @MessageBody() { stroke, sid }: { stroke: unknown; sid?: string }) {
    const c = this.ctx(client);
    if (!this.featureOn(c.roomId, 'whiteboard') || !this.openNow(c.roomId)) return { ok: false, closed: true };
    client.to(this.room(client)).emit('wb:stroke', { stroke, sid });
    return { ok: true };
  }
  @SubscribeMessage('wb:stroke:partial')
  wbPartial(@ConnectedSocket() client: Socket, @MessageBody() { sid, meta, points }: { sid: string; meta: unknown; points: unknown }) {
    const c = this.ctx(client);
    if (!this.featureOn(c.roomId, 'whiteboard') || !this.openNow(c.roomId)) return;
    client.to(this.room(client)).emit('wb:stroke:partial', { sid, meta, points });
  }
  @SubscribeMessage('wb:clear')
  wbClear(@ConnectedSocket() client: Socket) {
    const c = this.ctx(client);
    if (!this.featureOn(c.roomId, 'whiteboard') || !this.openNow(c.roomId)) return { ok: false, closed: true };
    client.to(this.room(client)).emit('wb:clear', {});
    return { ok: true };
  }
  @SubscribeMessage('wb:save')
  async wbSave(@ConnectedSocket() client: Socket, @MessageBody() { strokes, backgroundUrl }: { strokes: unknown; backgroundUrl?: string | null }) {
    const c = this.ctx(client);
    if (!this.featureOn(c.roomId, 'whiteboard') || !this.openNow(c.roomId)) return { ok: false, closed: true };
    await this.svc.saveSnapshot(c.roomId, c.participantId, strokes, backgroundUrl);
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
