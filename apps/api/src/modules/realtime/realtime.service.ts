import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';

export type FeatureMode = 'off' | 'all' | 'premium';
export type RealtimeFeatures = { chat: FeatureMode; whiteboard: FeatureMode; notif: FeatureMode };

/** 실시간 기능(채팅·화이트보드·알림) 정책 + 채팅 데이터 + 접근제어. */
@Injectable()
export class RealtimeService {
  constructor(private readonly prisma: PrismaService) {}

  private static readonly KEY = 'realtime_features';
  private static readonly DEFAULT: RealtimeFeatures = { chat: 'all', whiteboard: 'premium', notif: 'all' };

  async getFeatures(): Promise<RealtimeFeatures> {
    const row = await this.prisma.system_setting.findUnique({ where: { key: RealtimeService.KEY } });
    return { ...RealtimeService.DEFAULT, ...((row?.value as object) ?? {}) };
  }

  private isHq(actor: AuthUser) { return actor.role === AccountRole.ADMIN && !actor.centerId; }

  async setFeatures(actor: AuthUser, dto: Partial<RealtimeFeatures>) {
    if (!this.isHq(actor)) throw new ForbiddenException('실시간 기능 정책은 본사 마스터관리자만 변경할 수 있습니다.');
    const next = { ...(await this.getFeatures()), ...dto };
    await this.prisma.system_setting.upsert({
      where: { key: RealtimeService.KEY },
      create: { key: RealtimeService.KEY, value: next as object, updated_by: actor.id },
      update: { value: next as object, updated_by: actor.id, updated_at: new Date() },
    });
    return next;
  }

  /** 학생이 프리미엄 등급인지(상품별 게이팅용). */
  private async isPremiumStudent(studentId: string): Promise<boolean> {
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: studentId },
      select: { membership_grade: { select: { name: true, tier: true } } },
    });
    const g = sp?.membership_grade;
    // 티어 기준(Premium=3 이상 — VIP 포함). 이름 매칭은 커스텀 등급명 폴백.
    return (g?.tier ?? 0) >= 3 || /premium|프리미엄/i.test(g?.name ?? '');
  }

  /** 이 사용자에게 각 기능이 열려 있는지(예약 참여자 기준). */
  async featureAccess(user: AuthUser, studentIdOfRoom?: string): Promise<{ chat: boolean; whiteboard: boolean; notif: boolean }> {
    const f = await this.getFeatures();
    const resolve = async (mode: FeatureMode) => {
      if (mode === 'off') return false;
      if (mode === 'all') return true;
      // premium: 선생님·관리자는 허용, 학생은 프리미엄 등급일 때만
      if (user.role !== AccountRole.STUDENT) {
        const sid = studentIdOfRoom;
        return sid ? this.isPremiumStudent(sid) : true;
      }
      return this.isPremiumStudent(user.id);
    };
    return { chat: await resolve(f.chat), whiteboard: await resolve(f.whiteboard), notif: await resolve(f.notif) };
  }

  /** 실시간 알림 push 가 이 수신자에게 허용되는지(notif 정책 기준). 비학생(직원)은 premium 에서도 허용. */
  async notifAllowed(recipientId: string): Promise<boolean> {
    const f = await this.getFeatures();
    if (f.notif === 'off') return false;
    if (f.notif === 'all') return true;
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: recipientId },
      select: { membership_grade: { select: { name: true, tier: true } } },
    });
    if (!sp) return true; // 학생 프로필 없음 = 직원/보호자
    // 티어 기준(Premium=3 이상 — VIP 포함) + 커스텀 등급명 폴백(isPremiumStudent 와 동일 규칙).
    return (sp.membership_grade?.tier ?? 0) >= 3 || /premium|프리미엄/i.test(sp.membership_grade?.name ?? '');
  }

  // 라이브 세션(줌·오프라인·필기·보드)은 예약 시간대에만 실시간 상호작용 허용.
  // 채팅형 상담(mode='chat')은 O88(b) 상시 개방 — 단, 종료 후 유예일(기본 3일)이 지나면 읽기 전용(O88 보강·O94).
  private static readonly PRE_MS = 5 * 60 * 1000;
  private static readonly POST_MS = 5 * 60 * 1000;
  // 채팅형 유예(일) — system_setting 'chat_session' {lockAfterDays} 로 조정, 0 = 무기한(구 O88 그대로).
  private static readonly CHAT_LOCK_DAYS_DEFAULT = 3;
  private chatLockDays = RealtimeService.CHAT_LOCK_DAYS_DEFAULT;
  private chatLockLoadedAt = 0;
  private refreshChatLockDays() {
    if (Date.now() - this.chatLockLoadedAt < 60_000) return; // 1분 캐시 — 조회 폭주 방지
    this.chatLockLoadedAt = Date.now();
    void this.prisma.system_setting.findUnique({ where: { key: 'chat_session' } })
      .then((row) => {
        const v = (row?.value as { lockAfterDays?: number } | null)?.lockAfterDays;
        this.chatLockDays = typeof v === 'number' && v >= 0 ? v : RealtimeService.CHAT_LOCK_DAYS_DEFAULT;
      })
      .catch(() => { /* 설정 조회 실패 — 기본값 유지 */ });
  }

  /** 세션 시간창 계산. restricted=false 면 상시 개방(시간미정 채팅형 등). */
  sessionWindow(b: { mode: string | null; start_at: Date | null; end_at: Date | null }): {
    restricted: boolean; state: 'before' | 'open' | 'closed'; opensAt: Date | null; closesAt: Date | null;
  } {
    const now = Date.now();
    if (b.mode === 'chat') {
      // 채팅형: 시작 전에도 열려 있고(안내·사전 질문 허용), 종료 + 유예일 후에만 읽기 전용.
      this.refreshChatLockDays();
      if (!b.end_at || this.chatLockDays === 0) return { restricted: false, state: 'open', opensAt: null, closesAt: null };
      const closesAt = new Date(b.end_at.getTime() + this.chatLockDays * 86_400_000);
      return { restricted: true, state: now > closesAt.getTime() ? 'closed' : 'open', opensAt: null, closesAt };
    }
    const restricted = !!b.start_at && !!b.end_at;
    if (!restricted) return { restricted: false, state: 'open', opensAt: null, closesAt: null };
    const opensAt = new Date(b.start_at!.getTime() - RealtimeService.PRE_MS);
    const closesAt = new Date(b.end_at!.getTime() + RealtimeService.POST_MS);
    const state = now < opensAt.getTime() ? 'before' : now > closesAt.getTime() ? 'closed' : 'open';
    return { restricted: true, state, opensAt, closesAt };
  }

  /** 지금 실시간 쓰기(메시지·반응·필기)가 허용되는지. */
  sessionOpen(b: { mode: string | null; start_at: Date | null; end_at: Date | null }): boolean {
    const w = this.sessionWindow(b);
    return !w.restricted || w.state === 'open';
  }

  /** 클라이언트 전달용(ISO). mode 는 도구 노출 게이팅(음성/화상=zoom 전용, O89)에 사용. */
  sessionInfo(b: { mode: string | null; start_at: Date | null; end_at: Date | null }) {
    const w = this.sessionWindow(b);
    return { restricted: w.restricted, state: w.state, opensAt: w.opensAt?.toISOString() ?? null, closesAt: w.closesAt?.toISOString() ?? null, mode: b.mode ?? null };
  }

  /** 예약 참여자(학생/담당 선생님)만 방 접근. 반환: 예약 + 상대 정보. */
  async assertRoomAccess(user: AuthUser, bookingId: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, student_id: true, teacher_id: true, mode: true, status: true, start_at: true, end_at: true },
    });
    if (!b) throw new NotFoundException('예약을 찾을 수 없습니다.');
    const isParticipant = b.student_id === user.id || b.teacher_id === user.id ||
      user.role === AccountRole.ADMIN || user.role === AccountRole.HR;
    if (!isParticipant) throw new ForbiddenException('이 상담의 참여자가 아닙니다.');
    return b;
  }

  // 부재중 채팅 알림 스로틀 — 예약·수신자당 10분에 1건(원장 폭주 방지). 키: bookingId:recipientId
  private readonly chatNotifiedAt = new Map<string, number>();
  private static readonly CHAT_NOTIFY_GAP_MS = 10 * 60 * 1000;

  /** 방에 없는 상대에게 새 채팅 알림 원장 기록(스로틀) — 알림 목록·뱃지에서 확인용. 반환: 기록 여부. */
  async recordChatUnread(bookingId: string, recipientId: string): Promise<boolean> {
    const key = `${bookingId}:${recipientId}`;
    const last = this.chatNotifiedAt.get(key) ?? 0;
    if (Date.now() - last < RealtimeService.CHAT_NOTIFY_GAP_MS) return false;
    this.chatNotifiedAt.set(key, Date.now());
    try {
      await this.prisma.notification.create({
        data: { recipient_id: recipientId, type: 'chat_message', channels: ['app'], payload: { bookingId } as object },
      });
      return true;
    } catch { return false; }
  }

  /** 선생님 상담 인지 자동 스탬프 — 채팅·보드 입장 = 인지(ack). 최초 1회만 true 반환. */
  async stampTeacherAck(bookingId: string, teacherId: string): Promise<boolean> {
    const r = await this.prisma.booking.updateMany({
      where: { id: bookingId, teacher_id: teacherId, teacher_ack_at: null },
      data: { teacher_ack_at: new Date() },
    });
    return r.count > 0;
  }

  async history(user: AuthUser, bookingId: string) {
    const b = await this.assertRoomAccess(user, bookingId);
    const rows = await this.prisma.chat_message.findMany({
      where: { booking_id: bookingId }, orderBy: { created_at: 'asc' }, take: 500,
    });
    // 답장 인용 프리뷰(같은 창 안의 원본 메시지에서 발췌)
    const byId = new Map(rows.map((r) => [r.id, r]));
    return {
      bookingId, studentId: b.student_id, teacherId: b.teacher_id,
      messages: rows.map((m) => this.shape(m, user.id, m.reply_to_id ? byId.get(m.reply_to_id) : null)),
    };
  }

  async saveMessage(senderId: string, bookingId: string, kind: string, body: string | null, imageFileId: string | null, replyToId?: string | null) {
    const m = await this.prisma.chat_message.create({
      data: { booking_id: bookingId, sender_id: senderId, kind, body, image_file_id: imageFileId, reply_to_id: replyToId ?? null },
    });
    // 답장 원본 프리뷰 첨부(같은 예약의 메시지만)
    const orig = replyToId ? await this.prisma.chat_message.findFirst({ where: { id: replyToId, booking_id: bookingId } }) : null;
    return this.shape(m, senderId, orig);
  }

  /** 메시지 삭제(회수) — 본인 발신만, soft delete(원문 보존: C1 직거래 감사·분쟁 대응). */
  async deleteMessage(userId: string, bookingId: string, messageId: string): Promise<boolean> {
    const r = await this.prisma.chat_message.updateMany({
      where: { id: messageId, booking_id: bookingId, sender_id: userId, deleted_at: null },
      data: { deleted_at: new Date() },
    });
    return r.count > 0;
  }

  /** 시스템 메시지(세션·녹음 안내) — sender 없음, kind='system'. 중앙 회색 칩으로 표시. */
  async saveSystemMessage(bookingId: string, body: string) {
    const m = await this.prisma.chat_message.create({
      data: { booking_id: bookingId, sender_id: null, kind: 'system', body },
    });
    return this.shape(m, '');
  }

  /** 같은 본문의 시스템 메시지가 이미 있는지(세션 종료 안내 등 중복 방지). */
  async hasSystemMessage(bookingId: string, body: string): Promise<boolean> {
    const m = await this.prisma.chat_message.findFirst({ where: { booking_id: bookingId, kind: 'system', body } });
    return !!m;
  }

  /** 이모지 반응 토글(같은 예약의 메시지만). 반환: 갱신된 reactions. */
  async toggleReaction(userId: string, bookingId: string, messageId: string, emoji: string) {
    const m = await this.prisma.chat_message.findFirst({ where: { id: messageId, booking_id: bookingId } });
    if (!m || m.deleted_at) return null;
    const reactions: Record<string, string[]> = { ...((m.reactions as Record<string, string[]>) ?? {}) };
    const arr = new Set(reactions[emoji] ?? []);
    if (arr.has(userId)) arr.delete(userId); else arr.add(userId);
    if (arr.size) reactions[emoji] = [...arr]; else delete reactions[emoji];
    await this.prisma.chat_message.update({ where: { id: messageId }, data: { reactions } });
    return reactions;
  }

  private shape(
    m: { id: string; sender_id: string | null; kind: string; body: string | null; image_file_id: string | null; reply_to_id?: string | null; reactions?: unknown; created_at: Date; read_at?: Date | null; deleted_at?: Date | null },
    viewerId: string,
    orig?: { id: string; sender_id: string | null; kind: string; body: string | null; deleted_at?: Date | null } | null,
  ) {
    // 삭제(회수)된 메시지는 내용을 내려보내지 않는다 — kind='deleted' 묘비만.
    if (m.deleted_at) {
      return {
        id: m.id, senderId: m.sender_id, mine: m.sender_id === viewerId, kind: 'deleted', body: null,
        imageFileId: null, createdAt: m.created_at, readAt: m.read_at ?? null,
        reactions: {} as Record<string, string[]>, replyToId: null, replyTo: null,
      };
    }
    return {
      id: m.id, senderId: m.sender_id, mine: m.sender_id === viewerId, kind: m.kind, body: m.body,
      imageFileId: m.image_file_id, createdAt: m.created_at, readAt: m.read_at ?? null,
      reactions: (m.reactions as Record<string, string[]>) ?? {},
      replyToId: m.reply_to_id ?? null,
      replyTo: orig && !orig.deleted_at ? { id: orig.id, senderId: orig.sender_id, kind: orig.kind, body: orig.body ? orig.body.slice(0, 80) : null } : null,
    };
  }

  /** C1 직거래·연락처 감지 기록 — audit_log 재사용(action='moderation_flag'). 실패해도 본 작업 비차단. */
  async flagModeration(actor: AuthUser, context: string, refId: string, kinds: string[], text: string) {
    try {
      await this.prisma.audit_log.create({
        data: {
          actor_id: actor.id, actor_role: actor.role,
          action: 'moderation_flag', target_type: context, target_id: refId,
          summary: text.slice(0, 120),
          meta: { kinds } as object,
          center_id: actor.centerId ?? null,
        },
      });
    } catch { /* 기록 실패는 삼킨다 */ }
  }

  /** 이 사용자가 방을 열람 → 상대가 보낸 미확인 메시지를 읽음 처리. 반환: 처리 건수 + 시각. */
  async markRead(user: AuthUser, bookingId: string) {
    await this.assertRoomAccess(user, bookingId);
    const at = new Date();
    const r = await this.prisma.chat_message.updateMany({
      where: { booking_id: bookingId, sender_id: { not: user.id }, read_at: null },
      data: { read_at: at },
    });
    return { count: r.count, at, readerId: user.id };
  }

  /** 내 예약들의 미확인(상대가 보낸 안 읽은) 메시지 수 — 예약별. 목록 배지용. */
  async unreadCounts(user: AuthUser): Promise<Record<string, number>> {
    const rows = await this.prisma.$queryRaw<Array<{ booking_id: string; n: bigint }>>`
      SELECT cm.booking_id, count(*)::int AS n
      FROM chat_message cm JOIN booking b ON b.id = cm.booking_id
      WHERE (b.student_id = ${user.id}::uuid OR b.teacher_id = ${user.id}::uuid)
        AND cm.sender_id IS DISTINCT FROM ${user.id}::uuid
        AND cm.read_at IS NULL
        AND cm.deleted_at IS NULL
      GROUP BY cm.booking_id`;
    const out: Record<string, number> = {};
    for (const r of rows) out[r.booking_id] = Number(r.n);
    return out;
  }

  async saveSnapshot(userId: string, bookingId: string, strokes: unknown, backgroundFileId?: string | null) {
    return this.prisma.whiteboard_snapshot.create({
      data: { booking_id: bookingId, strokes: strokes as object, created_by: userId, background_file_id: backgroundFileId ?? null },
    });
  }
  async latestSnapshot(bookingId: string) {
    return this.prisma.whiteboard_snapshot.findFirst({ where: { booking_id: bookingId }, orderBy: { created_at: 'desc' } });
  }
}
