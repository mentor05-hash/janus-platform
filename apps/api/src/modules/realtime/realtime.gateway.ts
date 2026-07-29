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
import {
  detectDirectContact,
  DIRECT_CONTACT_WARNING,
} from '../../common/moderation/direct-contact';
import { resolveCorsOrigin } from '../../common/cors-origin';
import { RealtimeService } from './realtime.service';

type SockUser = {
  id: string;
  role: string;
  centerId: string | null;
  loginId: string;
};

/** 실시간 게이트웨이 — 예약 기반 채팅·화이트보드 + 유저룸 알림. path 는 nginx /api/ 프록시와 정합. */
// cors.origin 은 HTTP(main.ts)와 동일 정책(CORS_ORIGINS allowlist·운영 거부) — 임의 오리진 인증 WS 차단.
@WebSocketGateway({
  path: '/api/v1/socket.io',
  cors: { origin: resolveCorsOrigin(), credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger('Realtime');
  @WebSocketServer() server!: Server;
  // 예약별 세션 시간창 캐시(고빈도 wb:stroke 경로의 DB 조회 회피). 창은 예약당 불변 → 캐시 안전.
  // voice: 음성/화상 허용 여부(mode='zoom' 전용, O89) — call:signal 게이팅용.
  private readonly windows = new Map<
    string,
    { restricted: boolean; opensMs: number; closesMs: number; voice: boolean }
  >();
  // 세션 종료 시스템 메시지 예약 타이머(예약당 1회 — DB 중복검사로 재기동·다중 join 에도 멱등).
  private readonly closeTimers = new Map<string, NodeJS.Timeout>();
  private static readonly CLOSE_NOTICE =
    '🔒 상담 시간이 종료되었습니다. 채팅은 열람만 가능해요.';
  // 채팅형(mode='chat')은 종료 시 정보성 안내(O88 결정 B안) — 이후 유예일 경과 시 읽기 전용(O88 보강).
  private static readonly CHAT_END_NOTICE =
    '📅 예약 상담 시간이 지났어요. 채팅은 당분간 열려 있지만 답변이 늦을 수 있고, 일정 기간이 지나면 열람만 가능해요.';

  constructor(
    private readonly jwt: JwtService,
    private readonly svc: RealtimeService,
  ) {}

  private rememberWindow(
    bookingId: string,
    b: { mode: string | null; start_at: Date | null; end_at: Date | null },
  ) {
    const w = this.svc.sessionWindow(b);
    this.windows.set(bookingId, {
      restricted: w.restricted,
      opensMs: w.opensAt?.getTime() ?? 0,
      closesMs: w.closesAt?.getTime() ?? 0,
      voice: b.mode === 'zoom',
    });
    if (b.mode === 'chat') {
      // 채팅형: 예약 종료 시각에 정보성 안내(즉시 잠금 없음 — 유예일 경과 시 서버 게이트가 읽기 전용 처리)
      if (b.end_at)
        this.scheduleNotice(
          bookingId,
          b.end_at.getTime(),
          RealtimeGateway.CHAT_END_NOTICE,
        );
    } else if (w.restricted) {
      // 시간제한형: 유예창 마감(종료+5분)에 잠금 안내
      this.scheduleNotice(
        bookingId,
        w.closesAt!.getTime(),
        RealtimeGateway.CLOSE_NOTICE,
      );
    }
  }

  /** 지정 시각에 시스템 메시지 1회 게시(예약당 타이머 1개, DB 중복검사로 멱등). */
  private scheduleNotice(bookingId: string, atMs: number, body: string) {
    if (this.closeTimers.has(bookingId)) return;
    const delay = atMs - Date.now();
    if (delay <= 0 || delay > 2 ** 31 - 1) return; // 이미 지남(뒷북 안내 금지) 또는 과도한 지연
    const t = setTimeout(() => {
      this.closeTimers.delete(bookingId);
      void this.systemMessage(bookingId, body, { once: true });
    }, delay);
    if (typeof t.unref === 'function') t.unref();
    this.closeTimers.set(bookingId, t);
  }

  /** 선생님이 채팅·보드에 입장 = 상담 인지(ack) 자동 스탬프 + 학생에게 실시간 토스트(최초 1회). */
  private autoAck(
    user: AuthUser,
    b: { id?: string; student_id: string | null; teacher_id: string | null },
  ) {
    const bookingId = (b as { id: string }).id;
    if (!bookingId || user.id !== b.teacher_id || !b.student_id) return;
    void this.svc
      .stampTeacherAck(bookingId, user.id)
      .then((first) => {
        if (first)
          this.emitToUser(b.student_id!, 'notif:new', {
            type: 'booking_acked',
            payload: { bookingId },
            title: '선생님 확인 ✓',
            body: '선생님이 상담을 확인했어요.',
          });
      })
      .catch(() => {
        /* 스탬프 실패는 비차단 */
      });
  }

  /** 시스템 메시지 게시 + 방 브로드캐스트(녹음 시작/중단, 세션 종료 안내 등 — 외부 모듈에서도 호출). */
  async systemMessage(
    bookingId: string,
    body: string,
    opts?: { once?: boolean },
  ) {
    try {
      if (opts?.once && (await this.svc.hasSystemMessage(bookingId, body)))
        return;
      const msg = await this.svc.saveSystemMessage(bookingId, body);
      this.server
        ?.to(`booking:${bookingId}`)
        .emit('chat:message', { ...msg, mine: false });
    } catch {
      /* 안내 실패는 본 작업 비차단 */
    }
  }
  /** 캐시된 창 기준으로 지금 필기 가능한지(캐시 없으면 관대하게 허용 — join 이 항상 선행). */
  private openNow(bookingId: string): boolean {
    const w = this.windows.get(bookingId);
    if (!w || !w.restricted) return true;
    const now = Date.now();
    return now >= w.opensMs && now <= w.closesMs;
  }

  /** 접속 시 JWT 검증 → 유저룸 조인. 실패하면 연결 종료. */
  handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query?.token as string);
      // 제네릭으로 받는다 — `verify()` 의 기본 반환은 any 라 그대로 쓰면 아래 전부가
      // no-unsafe-* 가 된다. `as` 단언으로 덮으면 no-unnecessary-type-assertion 이
      // "any 는 무엇에든 대입 가능"이라며 불필요로 오판해 자동수정이 다시 지운다.
      const payload = this.jwt.verify<{
        sub: string;
        role: string;
        centerId: string | null;
        loginId: string;
      }>(token);
      const user: SockUser = {
        id: payload.sub,
        role: payload.role,
        centerId: payload.centerId ?? null,
        loginId: payload.loginId,
      };
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
  async chatJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() { bookingId }: { bookingId: string },
  ) {
    const user = this.user(client);
    const b = await this.svc.assertRoomAccess(user, bookingId);
    const access = await this.svc.featureAccess(
      user,
      b.student_id ?? undefined,
    );
    client.join(`booking:${bookingId}`);
    this.rememberWindow(bookingId, b);
    this.autoAck(user, b);
    const hist = await this.svc.history(user, bookingId);
    // 입장 = 열람: 상대가 보낸 미확인 메시지를 읽음 처리 후 방에 읽음 통지(상대 '읽음' 표시).
    const read = await this.svc.markRead(user, bookingId);
    if (read.count > 0)
      client
        .to(`booking:${bookingId}`)
        .emit('chat:read', { bookingId, readerId: read.readerId, at: read.at });
    // O95 — 유예 중 학생 무료 발신 현황(채팅형·종료 후에만 의미). CTA·남은 건수 표시용.
    let postFree: { used: number; limit: number } | null = null;
    if (b.mode === 'chat' && b.end_at && Date.now() > b.end_at.getTime()) {
      const limit = this.svc.postFreeLimit;
      if (limit > 0)
        postFree = {
          used: await this.svc.countPostEndStudentMsgs(b, bookingId),
          limit,
        };
    }
    return {
      ok: true,
      access,
      messages: hist.messages,
      session: {
        ...this.svc.sessionInfo(b),
        teacherId: b.teacher_id,
        postFree,
      },
    };
  }

  /** 입력 중 표시 — 방의 상대에게만 전달(영속 없음). mode='voice' 는 음성 녹음 중 표시. */
  @SubscribeMessage('chat:typing')
  chatTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    {
      bookingId,
      typing,
      mode,
    }: { bookingId: string; typing: boolean; mode?: string },
  ) {
    const user = this.user(client);
    client.to(`booking:${bookingId}`).emit('chat:typing', {
      bookingId,
      userId: user.id,
      typing: !!typing,
      mode: mode === 'voice' ? 'voice' : undefined,
    });
    return { ok: true };
  }

  /** 열람 알림 — 상대가 보낸 메시지를 읽음 처리하고 방에 통지. */
  @SubscribeMessage('chat:read')
  async chatRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() { bookingId }: { bookingId: string },
  ) {
    const user = this.user(client);
    const read = await this.svc.markRead(user, bookingId);
    if (read.count > 0)
      client
        .to(`booking:${bookingId}`)
        .emit('chat:read', { bookingId, readerId: read.readerId, at: read.at });
    return { ok: true, count: read.count };
  }

  @SubscribeMessage('chat:send')
  async chatSend(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    {
      bookingId,
      body,
      imageFileId,
      fileId,
      fileName,
      audioFileId,
      replyToId,
    }: {
      bookingId: string;
      body?: string;
      imageFileId?: string;
      fileId?: string;
      fileName?: string;
      audioFileId?: string;
      replyToId?: string;
    },
  ) {
    const user = this.user(client);
    const b = await this.svc.assertRoomAccess(user, bookingId);
    const access = await this.svc.featureAccess(user);
    if (!access.chat)
      return { ok: false, error: '채팅이 비활성화되어 있습니다.' };
    if (!this.svc.sessionOpen(b))
      return {
        ok: false,
        closed: true,
        error:
          '상담 세션 시간이 아닙니다. 예약 시간대에만 메시지를 보낼 수 있어요.',
      };
    if (!body?.trim() && !imageFileId && !fileId && !audioFileId)
      return { ok: false };
    // O95(A안) — 채팅형 종료 후 학생 무료 발신 한도(기본 5건). 초과분은 질문권·이어상담으로 유도(선생님은 무제한).
    let postUsedNow: number | null = null;
    if (
      b.mode === 'chat' &&
      b.end_at &&
      Date.now() > b.end_at.getTime() &&
      user.id === b.student_id
    ) {
      const limit = this.svc.postFreeLimit;
      if (limit > 0) {
        postUsedNow = await this.svc.countPostEndStudentMsgs(b, bookingId);
        if (postUsedNow >= limit) {
          return {
            ok: false,
            postLimit: true,
            error:
              '상담 종료 후 무료 마무리 메시지를 모두 사용했어요. 추가 질문은 [질문 올리기] 또는 [이어서 상담]으로 부탁드려요.',
          };
        }
      }
    }
    // 파일(PDF·문서)·음성은 kind 만 다르고 image_file_id 재사용, body 에 파일명 저장(표시용)
    const kind = imageFileId
      ? 'image'
      : audioFileId
        ? 'audio'
        : fileId
          ? 'file'
          : 'text';
    const savedBody = audioFileId
      ? (fileName ?? '음성 메시지')
      : fileId
        ? (fileName ?? '첨부파일')
        : body?.trim() || null;
    const msg = await this.svc.saveMessage(
      user.id,
      bookingId,
      kind,
      savedBody,
      imageFileId ?? audioFileId ?? fileId ?? null,
      replyToId ?? null,
    );
    // C1 직거래·연락처 감지 — 차단하지 않는다: 발신자 경고 + 감사 기록(오탐 안전 설계).
    const modKinds = detectDirectContact(savedBody);
    if (modKinds.length > 0) {
      client.emit('chat:moderation', { warning: DIRECT_CONTACT_WARNING });
      void this.svc.flagModeration(
        user,
        'chat',
        bookingId,
        modKinds,
        savedBody ?? '',
      );
    }
    // 수신자별로 mine 을 서버에서 계산해 개별 전송(클라이언트 myId 오류와 무관하게 좌/우 정렬 보장).
    const sockets = await this.server.in(`booking:${bookingId}`).fetchSockets();
    for (const sock of sockets) {
      const viewerId = (sock.data.user as { id?: string } | undefined)?.id;
      sock.emit('chat:message', { ...msg, mine: msg.senderId === viewerId });
    }
    // O95 — 이번 발신으로 무료 한도 도달 시 시스템 안내 1회 + 발신자 잔여 갱신.
    if (postUsedNow != null) {
      const limit = this.svc.postFreeLimit;
      client.emit('chat:postfree', { used: postUsedNow + 1, limit });
      if (postUsedNow + 1 === limit) {
        void this.systemMessage(
          bookingId,
          '📝 상담 종료 후 무료 마무리 메시지를 모두 사용했어요. 추가 질문은 [질문 올리기]나 [이어서 상담]으로 이어가 주세요.',
          { once: true },
        );
      }
    }
    // 부재중 알림 — 상대가 이 채팅방에 없으면(지난 채팅의 추가 질문 포함) 토스트 + 알림 원장(10분 스로틀).
    const counterpart = user.id === b.teacher_id ? b.student_id : b.teacher_id;
    if (
      counterpart &&
      !sockets.some(
        (sk) =>
          (sk.data.user as { id?: string } | undefined)?.id === counterpart,
      )
    ) {
      const preview =
        kind === 'text'
          ? (savedBody ?? '').slice(0, 40)
          : kind === 'image'
            ? '📷 사진'
            : kind === 'audio'
              ? '🎤 음성 메시지'
              : '📎 파일';
      this.emitToUser(counterpart, 'notif:new', {
        type: 'chat_message',
        payload: { bookingId },
        title: '새 채팅 메시지',
        body: preview,
      });
      void this.svc.recordChatUnread(bookingId, counterpart);
    }
    return { ok: true, id: msg.id };
  }

  /** 메시지 삭제(회수) — 본인 발신만, soft delete(원문 DB 보존). 방 전체에 통지. */
  @SubscribeMessage('chat:delete')
  async chatDelete(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    { bookingId, messageId }: { bookingId: string; messageId: string },
  ) {
    const user = this.user(client);
    const b = await this.svc.assertRoomAccess(user, bookingId);
    if (!this.svc.sessionOpen(b)) return { ok: false, closed: true };
    if (!messageId) return { ok: false };
    const done = await this.svc.deleteMessage(user.id, bookingId, messageId);
    if (!done)
      return { ok: false, error: '본인이 보낸 메시지만 삭제할 수 있습니다.' };
    this.server.to(`booking:${bookingId}`).emit('chat:deleted', { messageId });
    return { ok: true };
  }

  /** 메시지 이모지 반응 토글 — 방 전체(발신자 포함)에 갱신 브로드캐스트. */
  @SubscribeMessage('chat:react')
  async chatReact(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    {
      bookingId,
      messageId,
      emoji,
    }: { bookingId: string; messageId: string; emoji: string },
  ) {
    const user = this.user(client);
    const b = await this.svc.assertRoomAccess(user, bookingId);
    if (!this.svc.sessionOpen(b)) return { ok: false, closed: true };
    if (!emoji || emoji.length > 8 || !messageId) return { ok: false };
    const reactions = await this.svc.toggleReaction(
      user.id,
      bookingId,
      messageId,
      emoji,
    );
    if (reactions === null) return { ok: false };
    this.server
      .to(`booking:${bookingId}`)
      .emit('chat:reaction', { messageId, reactions });
    return { ok: true, reactions };
  }

  // ── 화이트보드 ──
  @SubscribeMessage('wb:join')
  async wbJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() { bookingId }: { bookingId: string },
  ) {
    const user = this.user(client);
    const b = await this.svc.assertRoomAccess(user, bookingId);
    const access = await this.svc.featureAccess(
      user,
      b.student_id ?? undefined,
    );
    if (!access.whiteboard)
      return { ok: false, error: '화이트보드는 상위 상품에서 제공됩니다.' };
    client.join(`booking:${bookingId}`);
    this.rememberWindow(bookingId, b);
    this.autoAck(user, b);
    const snap = await this.svc.latestSnapshot(bookingId);
    return {
      ok: true,
      strokes: snap?.strokes ?? [],
      backgroundFileId: snap?.background_file_id ?? null,
      session: this.svc.sessionInfo(b),
    };
  }

  /** 배경 이미지(첨부/촬영/PDF 페이지) 설정 — 상대에게 브로드캐스트. page/pageCount 는 PDF 페이지 표시용. */
  @SubscribeMessage('wb:image')
  wbImage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    {
      bookingId,
      fileId,
      page,
      pageCount,
    }: {
      bookingId: string;
      fileId: string | null;
      page?: number;
      pageCount?: number;
    },
  ) {
    if (!this.openNow(bookingId)) return { ok: false, closed: true };
    client
      .to(`booking:${bookingId}`)
      .emit('wb:image', { fileId, page, pageCount });
    return { ok: true };
  }

  @SubscribeMessage('wb:stroke')
  wbStroke(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    {
      bookingId,
      stroke,
      sid,
    }: { bookingId: string; stroke: unknown; sid?: string },
  ) {
    if (!this.openNow(bookingId)) return { ok: false, closed: true };
    client.to(`booking:${bookingId}`).emit('wb:stroke', { stroke, sid }); // 발신자 제외 브로드캐스트(최종 획)
    return { ok: true };
  }

  /** 라이브 잉크: 그리는 중 부분 포인트 중계(발신자 제외). 최종 획은 wb:stroke 로 확정. */
  @SubscribeMessage('wb:stroke:partial')
  wbStrokePartial(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    {
      bookingId,
      sid,
      meta,
      points,
    }: { bookingId: string; sid: string; meta: unknown; points: unknown },
  ) {
    if (!this.openNow(bookingId)) return;
    client
      .to(`booking:${bookingId}`)
      .emit('wb:stroke:partial', { sid, meta, points });
  }

  @SubscribeMessage('wb:clear')
  wbClear(
    @ConnectedSocket() client: Socket,
    @MessageBody() { bookingId }: { bookingId: string },
  ) {
    if (!this.openNow(bookingId)) return { ok: false, closed: true };
    client.to(`booking:${bookingId}`).emit('wb:clear', {});
    return { ok: true };
  }

  /** 벌크 재동기화(되돌리기 등) — 전체 스트로크 집합 교체를 상대에게 중계. */
  @SubscribeMessage('wb:sync')
  wbSync(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    { bookingId, strokes }: { bookingId: string; strokes: unknown },
  ) {
    if (!this.openNow(bookingId)) return { ok: false, closed: true };
    client.to(`booking:${bookingId}`).emit('wb:sync', { strokes });
    return { ok: true };
  }

  /** 안내선(모눈/줄) 모드 동기화 — 세션 한정(스냅샷 저장 안 함). */
  @SubscribeMessage('wb:grid')
  wbGrid(
    @ConnectedSocket() client: Socket,
    @MessageBody() { bookingId, grid }: { bookingId: string; grid: string },
  ) {
    if (!this.openNow(bookingId)) return;
    client.to(`booking:${bookingId}`).emit('wb:grid', { grid });
  }

  /** 레이저 포인터 궤적 중계(비영구 — 저장 안 함, 발신자 제외). */
  @SubscribeMessage('wb:laser')
  wbLaser(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    {
      bookingId,
      sid,
      points,
    }: { bookingId: string; sid?: string; points: unknown },
  ) {
    if (!this.openNow(bookingId)) return;
    client.to(`booking:${bookingId}`).emit('wb:laser', { sid, points });
  }

  @SubscribeMessage('wb:save')
  async wbSave(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    {
      bookingId,
      strokes,
      backgroundFileId,
    }: {
      bookingId: string;
      strokes: unknown;
      backgroundFileId?: string | null;
    },
  ) {
    const user = this.user(client);
    const b = await this.svc.assertRoomAccess(user, bookingId);
    if (!this.svc.sessionOpen(b)) return { ok: false, closed: true };
    await this.svc.saveSnapshot(user.id, bookingId, strokes, backgroundFileId);
    return { ok: true };
  }

  // ── 음성통화(WebRTC 시그널링 중계) — 예약 room 의 상대에게 offer/answer/ICE 전달 ──
  @SubscribeMessage('call:join')
  async callJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() { bookingId }: { bookingId: string },
  ) {
    const user = this.user(client);
    const b = await this.svc.assertRoomAccess(user, bookingId);
    this.rememberWindow(bookingId, b); // 시그널 중계(call:signal) 게이팅용 창 캐시 — 거부되더라도 먼저 확보
    // 음성/화상은 방식으로 구분(O89) — 화상(zoom) 예약에서만. UI 숨김 우회 방지의 서버 권위 게이트.
    if (b.mode !== 'zoom')
      return {
        ok: false,
        error: '음성 통화는 화상 상담 예약에서만 사용할 수 있어요.',
      };
    if (!this.svc.sessionOpen(b))
      return { ok: false, closed: true, error: '상담 세션 시간이 아닙니다.' };
    client.join(`booking:${bookingId}`);
    client
      .to(`booking:${bookingId}`)
      .emit('call:peer-join', { userId: user.id });
    return { ok: true };
  }

  @SubscribeMessage('call:signal')
  callSignal(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    {
      bookingId,
      kind,
      data,
    }: { bookingId: string; kind: 'offer' | 'answer' | 'ice'; data: unknown },
  ) {
    if (!this.openNow(bookingId)) return { ok: false, closed: true };
    if (this.windows.get(bookingId)?.voice === false) return { ok: false }; // 비화상 예약 시그널 무시(O89)
    const user = this.user(client);
    client
      .to(`booking:${bookingId}`)
      .emit('call:signal', { from: user.id, kind, data }); // 발신자 제외 중계
    return { ok: true };
  }

  @SubscribeMessage('call:leave')
  callLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() { bookingId }: { bookingId: string },
  ) {
    const user = this.user(client);
    client
      .to(`booking:${bookingId}`)
      .emit('call:peer-leave', { userId: user.id });
    return { ok: true };
  }

  // ── 커뮤니티 게시글 실시간(답변·채택 반영) — 로그인 사용자면 열람 가능(공개 Q&A) ──
  @SubscribeMessage('community:join')
  communityJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() { postId }: { postId: string },
  ) {
    if (!postId) return { ok: false };
    client.join(`community:${postId}`);
    return { ok: true };
  }

  @SubscribeMessage('community:leave')
  communityLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() { postId }: { postId: string },
  ) {
    if (postId) client.leave(`community:${postId}`);
    return { ok: true };
  }

  /** 외부(알림 등)에서 특정 유저에게 실시간 이벤트 전송. */
  /** 접속 중인 선생님 전원에게 브로드캐스트 — 공개질문 풀 신호(qna_pool_new 등). DB 알림 없음(소음 방지). */
  async emitToTeachers(event: string, payload: unknown) {
    const sockets = await this.server.fetchSockets();
    for (const s of sockets) {
      if ((s.data.user as SockUser | undefined)?.role === 'teacher')
        s.emit(event, payload);
    }
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  /** 커뮤니티 게시글 방에 실시간 이벤트 전송(답변·채택 갱신). */
  emitToCommunity(postId: string, event: string, payload: unknown) {
    this.server?.to(`community:${postId}`).emit(event, payload);
  }
}
