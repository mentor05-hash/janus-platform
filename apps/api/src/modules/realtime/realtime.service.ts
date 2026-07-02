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
      select: { membership_grade: { select: { name: true } } },
    });
    return /premium|프리미엄/i.test(sp?.membership_grade?.name ?? '');
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
      select: { membership_grade: { select: { name: true } } },
    });
    if (!sp) return true; // 학생 프로필 없음 = 직원/보호자
    return /premium|프리미엄/i.test(sp.membership_grade?.name ?? '');
  }

  /** 예약 참여자(학생/담당 선생님)만 방 접근. 반환: 예약 + 상대 정보. */
  async assertRoomAccess(user: AuthUser, bookingId: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, student_id: true, teacher_id: true, mode: true, status: true },
    });
    if (!b) throw new NotFoundException('예약을 찾을 수 없습니다.');
    const isParticipant = b.student_id === user.id || b.teacher_id === user.id ||
      user.role === AccountRole.ADMIN || user.role === AccountRole.HR;
    if (!isParticipant) throw new ForbiddenException('이 상담의 참여자가 아닙니다.');
    return b;
  }

  async history(user: AuthUser, bookingId: string) {
    const b = await this.assertRoomAccess(user, bookingId);
    const rows = await this.prisma.chat_message.findMany({
      where: { booking_id: bookingId }, orderBy: { created_at: 'asc' }, take: 500,
    });
    return { bookingId, studentId: b.student_id, teacherId: b.teacher_id, messages: rows.map((m) => this.shape(m, user.id)) };
  }

  async saveMessage(senderId: string, bookingId: string, kind: string, body: string | null, imageFileId: string | null) {
    const m = await this.prisma.chat_message.create({
      data: { booking_id: bookingId, sender_id: senderId, kind, body, image_file_id: imageFileId },
    });
    return this.shape(m, senderId);
  }

  private shape(m: { id: string; sender_id: string | null; kind: string; body: string | null; image_file_id: string | null; created_at: Date; read_at?: Date | null }, viewerId: string) {
    return { id: m.id, senderId: m.sender_id, mine: m.sender_id === viewerId, kind: m.kind, body: m.body, imageFileId: m.image_file_id, createdAt: m.created_at, readAt: m.read_at ?? null };
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
      GROUP BY cm.booking_id`;
    const out: Record<string, number> = {};
    for (const r of rows) out[r.booking_id] = Number(r.n);
    return out;
  }

  async saveSnapshot(userId: string, bookingId: string, strokes: unknown) {
    return this.prisma.whiteboard_snapshot.create({ data: { booking_id: bookingId, strokes: strokes as object, created_by: userId } });
  }
  async latestSnapshot(bookingId: string) {
    return this.prisma.whiteboard_snapshot.findFirst({ where: { booking_id: bookingId }, orderBy: { created_at: 'desc' } });
  }
}
