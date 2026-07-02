import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { RealtimeService } from './realtime.service';

type SockUser = { id: string; role: string; centerId: string | null; loginId: string };

/** 실시간 게이트웨이 — 예약 기반 채팅·화이트보드 + 유저룸 알림. path 는 nginx /api/ 프록시와 정합. */
@WebSocketGateway({ path: '/api/v1/socket.io', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger('Realtime');
  @WebSocketServer() server!: Server;

  constructor(private readonly jwt: JwtService, private readonly svc: RealtimeService) {}

  /** 접속 시 JWT 검증 → 유저룸 조인. 실패하면 연결 종료. */
  handleConnection(client: Socket) {
    try {
      const token = (client.handshake.auth?.token as string) || (client.handshake.query?.token as string);
      const payload = this.jwt.verify(token) as { sub: string; role: string; centerId: string | null; loginId: string };
      const user: SockUser = { id: payload.sub, role: payload.role, centerId: payload.centerId ?? null, loginId: payload.loginId };
      client.data.user = user;
      client.join(`user:${user.id}`);
    } catch {
      client.emit('error', { message: '인증 실패' });
      client.disconnect(true);
    }
  }

  private user(client: Socket): AuthUser {
    return client.data.user as AuthUser;
  }

  @SubscribeMessage('chat:join')
  async chatJoin(@ConnectedSocket() client: Socket, @MessageBody() { bookingId }: { bookingId: string }) {
    const user = this.user(client);
    const b = await this.svc.assertRoomAccess(user, bookingId);
    const access = await this.svc.featureAccess(user, b.student_id ?? undefined);
    client.join(`booking:${bookingId}`);
    const hist = await this.svc.history(user, bookingId);
    return { ok: true, access, messages: hist.messages };
  }

  @SubscribeMessage('chat:send')
  async chatSend(@ConnectedSocket() client: Socket, @MessageBody() { bookingId, body, imageFileId }: { bookingId: string; body?: string; imageFileId?: string }) {
    const user = this.user(client);
    await this.svc.assertRoomAccess(user, bookingId);
    const access = await this.svc.featureAccess(user);
    if (!access.chat) return { ok: false, error: '채팅이 비활성화되어 있습니다.' };
    if (!body?.trim() && !imageFileId) return { ok: false };
    const msg = await this.svc.saveMessage(user.id, bookingId, imageFileId ? 'image' : 'text', body?.trim() || null, imageFileId ?? null);
    // 수신자별로 mine 을 서버에서 계산해 개별 전송(클라이언트 myId 오류와 무관하게 좌/우 정렬 보장).
    const sockets = await this.server.in(`booking:${bookingId}`).fetchSockets();
    for (const sock of sockets) {
      const viewerId = (sock.data.user as { id?: string } | undefined)?.id;
      sock.emit('chat:message', { ...msg, mine: msg.senderId === viewerId });
    }
    return { ok: true, id: msg.id };
  }

  // ── 화이트보드 ──
  @SubscribeMessage('wb:join')
  async wbJoin(@ConnectedSocket() client: Socket, @MessageBody() { bookingId }: { bookingId: string }) {
    const user = this.user(client);
    const b = await this.svc.assertRoomAccess(user, bookingId);
    const access = await this.svc.featureAccess(user, b.student_id ?? undefined);
    if (!access.whiteboard) return { ok: false, error: '화이트보드는 상위 상품에서 제공됩니다.' };
    client.join(`booking:${bookingId}`);
    const snap = await this.svc.latestSnapshot(bookingId);
    return { ok: true, strokes: snap?.strokes ?? [] };
  }

  @SubscribeMessage('wb:stroke')
  wbStroke(@ConnectedSocket() client: Socket, @MessageBody() { bookingId, stroke }: { bookingId: string; stroke: unknown }) {
    client.to(`booking:${bookingId}`).emit('wb:stroke', { stroke }); // 발신자 제외 브로드캐스트
    return { ok: true };
  }

  @SubscribeMessage('wb:clear')
  wbClear(@ConnectedSocket() client: Socket, @MessageBody() { bookingId }: { bookingId: string }) {
    client.to(`booking:${bookingId}`).emit('wb:clear', {});
    return { ok: true };
  }

  @SubscribeMessage('wb:save')
  async wbSave(@ConnectedSocket() client: Socket, @MessageBody() { bookingId, strokes }: { bookingId: string; strokes: unknown }) {
    const user = this.user(client);
    await this.svc.assertRoomAccess(user, bookingId);
    await this.svc.saveSnapshot(user.id, bookingId, strokes);
    return { ok: true };
  }

  /** 외부(알림 등)에서 특정 유저에게 실시간 이벤트 전송. */
  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}
