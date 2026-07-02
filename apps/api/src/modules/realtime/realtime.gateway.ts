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
    // 입장 = 열람: 상대가 보낸 미확인 메시지를 읽음 처리 후 방에 읽음 통지(상대 '읽음' 표시).
    const read = await this.svc.markRead(user, bookingId);
    if (read.count > 0) client.to(`booking:${bookingId}`).emit('chat:read', { bookingId, readerId: read.readerId, at: read.at });
    return { ok: true, access, messages: hist.messages };
  }

  /** 입력 중 표시 — 방의 상대에게만 전달(영속 없음). */
  @SubscribeMessage('chat:typing')
  chatTyping(@ConnectedSocket() client: Socket, @MessageBody() { bookingId, typing }: { bookingId: string; typing: boolean }) {
    const user = this.user(client);
    client.to(`booking:${bookingId}`).emit('chat:typing', { bookingId, userId: user.id, typing: !!typing });
    return { ok: true };
  }

  /** 열람 알림 — 상대가 보낸 메시지를 읽음 처리하고 방에 통지. */
  @SubscribeMessage('chat:read')
  async chatRead(@ConnectedSocket() client: Socket, @MessageBody() { bookingId }: { bookingId: string }) {
    const user = this.user(client);
    const read = await this.svc.markRead(user, bookingId);
    if (read.count > 0) client.to(`booking:${bookingId}`).emit('chat:read', { bookingId, readerId: read.readerId, at: read.at });
    return { ok: true, count: read.count };
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
    return { ok: true, strokes: snap?.strokes ?? [], backgroundFileId: snap?.background_file_id ?? null };
  }

  /** 배경 이미지(첨부/촬영) 설정 — 상대에게 브로드캐스트(필기는 이 위에 그려짐). */
  @SubscribeMessage('wb:image')
  wbImage(@ConnectedSocket() client: Socket, @MessageBody() { bookingId, fileId }: { bookingId: string; fileId: string | null }) {
    client.to(`booking:${bookingId}`).emit('wb:image', { fileId });
    return { ok: true };
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
  async wbSave(@ConnectedSocket() client: Socket, @MessageBody() { bookingId, strokes, backgroundFileId }: { bookingId: string; strokes: unknown; backgroundFileId?: string | null }) {
    const user = this.user(client);
    await this.svc.assertRoomAccess(user, bookingId);
    await this.svc.saveSnapshot(user.id, bookingId, strokes, backgroundFileId);
    return { ok: true };
  }

  // ── 음성통화(WebRTC 시그널링 중계) — 예약 room 의 상대에게 offer/answer/ICE 전달 ──
  @SubscribeMessage('call:join')
  async callJoin(@ConnectedSocket() client: Socket, @MessageBody() { bookingId }: { bookingId: string }) {
    const user = this.user(client);
    await this.svc.assertRoomAccess(user, bookingId);
    client.join(`booking:${bookingId}`);
    client.to(`booking:${bookingId}`).emit('call:peer-join', { userId: user.id });
    return { ok: true };
  }

  @SubscribeMessage('call:signal')
  callSignal(@ConnectedSocket() client: Socket, @MessageBody() { bookingId, kind, data }: { bookingId: string; kind: 'offer' | 'answer' | 'ice'; data: unknown }) {
    const user = this.user(client);
    client.to(`booking:${bookingId}`).emit('call:signal', { from: user.id, kind, data }); // 발신자 제외 중계
    return { ok: true };
  }

  @SubscribeMessage('call:leave')
  callLeave(@ConnectedSocket() client: Socket, @MessageBody() { bookingId }: { bookingId: string }) {
    const user = this.user(client);
    client.to(`booking:${bookingId}`).emit('call:peer-leave', { userId: user.id });
    return { ok: true };
  }

  /** 외부(알림 등)에서 특정 유저에게 실시간 이벤트 전송. */
  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}
