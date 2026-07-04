import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RoomsService, type RoomRow, type Feature } from './rooms.service';
import { TokenService } from './token.service';

type Ctx = { roomId: string; participantId: string; name?: string };

/**
 * 범용 실시간 룸 게이트웨이 — 채팅·화이트보드·음성(WebRTC 시그널).
 * 접속 토큰이 룸/참가자를 고정하므로 payload 의 roomId 를 신뢰하지 않고 토큰 값만 사용.
 * 시간창(opens/closes)·기능 플래그(features)로 게이팅. 창 밖/기능 off 면 쓰기 거부.
 */
@WebSocketGateway({ path: '/api/rt/v1/socket.io', cors: { origin: true, credentials: true } })
export class RoomsGateway implements OnGatewayConnection {
  private readonly logger = new Logger('RoomsRT');
  @WebSocketServer() server!: Server;
  private readonly windows = new Map<string, { restricted: boolean; opensMs: number; closesMs: number; features: RoomRow['features'] }>();

  constructor(private readonly svc: RoomsService, private readonly tokens: TokenService) {}

  handleConnection(client: Socket) {
    const token = (client.handshake.auth?.token as string) || (client.handshake.query?.token as string);
    const payload = this.tokens.verify(token);
    if (!payload) { client.emit('error', { message: '인증 실패' }); client.disconnect(true); return; }
    client.data.ctx = { roomId: payload.roomId, participantId: payload.participantId, name: payload.name } as Ctx;
  }
  private ctx(client: Socket): Ctx { return client.data.ctx as Ctx; }

  private remember(room: RoomRow) {
    const w = this.svc.sessionWindow(room);
    this.windows.set(room.id, { restricted: w.restricted, opensMs: w.opensAt?.getTime() ?? 0, closesMs: w.closesAt?.getTime() ?? 0, features: room.features });
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
    return { ok: true, participantId: c.participantId, features: room.features, session: this.svc.sessionInfo(room), messages };
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
