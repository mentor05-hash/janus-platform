import { Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { renderNotification, type NotifPayload } from '../notification/notification-templates';
import { consultTypeFromPrisma } from '../../config/prisma-enums';

/**
 * 선생님 인박스 집계(§선생님 모바일 2단계) — 대기 상담신청·질문·미확인 채팅·알림을 한 번에.
 * 여러 도메인을 가로지르므로 PrismaService + 순수 렌더 함수만 사용(크로스모듈 의존 없음).
 */
@Injectable()
export class InboxService {
  constructor(private readonly prisma: PrismaService) {}

  private async nameMap(ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    const rows = await this.prisma.account.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    return Object.fromEntries(rows.map((r) => [r.id, r.name ?? '학생']));
  }

  async teacherInbox(user: AuthUser) {
    const uid = user.id;
    const [requests, questions, notis, unreadRows] = await Promise.all([
      // 대기 상담신청(학생 발신, 수락 대기)
      this.prisma.booking.findMany({
        where: { teacher_id: uid, status: 'new' as never, direction: 'student' as never },
        select: { id: true, student_id: true, consult_type: true, sub_type: true, mode: true, start_at: true },
        orderBy: { created_at: 'desc' }, take: 40,
      }),
      // 답변 대기 질문(내게 지정 또는 공개, 미답변)
      this.prisma.qna_post.findMany({
        where: { status: 'open', OR: [{ assigned_teacher_id: uid }, { scope: 'open' as never }] },
        select: { id: true, student_id: true, body: true, scope: true, assigned_teacher_id: true, created_at: true },
        orderBy: { created_at: 'desc' }, take: 40,
      }),
      this.prisma.notification.findMany({ where: { recipient_id: uid }, orderBy: { created_at: 'desc' }, take: 40 }),
      // 미확인 채팅(상대가 보낸 안 읽은 메시지) — 예약별
      this.prisma.$queryRaw<Array<{ booking_id: string; n: bigint }>>`
        SELECT cm.booking_id, count(*)::int AS n
        FROM chat_message cm JOIN booking b ON b.id = cm.booking_id
        WHERE (b.student_id = ${uid}::uuid OR b.teacher_id = ${uid}::uuid)
          AND cm.sender_id IS DISTINCT FROM ${uid}::uuid AND cm.read_at IS NULL
        GROUP BY cm.booking_id`,
    ]);

    const names = await this.nameMap([...new Set([...requests.map((r) => r.student_id), ...questions.map((q) => q.student_id)])]);
    const unreadByBooking: Record<string, number> = {};
    for (const r of unreadRows) unreadByBooking[r.booking_id] = Number(r.n);
    const unreadChats = Object.values(unreadByBooking).reduce((a, b) => a + b, 0);
    const notifications = notis.map((n) => {
      const { title, body } = renderNotification(n.type ?? '', (n.payload as NotifPayload) ?? {});
      return { id: n.id, type: n.type, title, body, payload: n.payload, readAt: n.read_at, createdAt: n.created_at };
    });

    return {
      counts: {
        requests: requests.length,
        questions: questions.length,
        unreadChats,
        notifications: notifications.filter((n) => !n.readAt).length,
      },
      requests: requests.map((r) => ({
        bookingId: r.id, studentName: names[r.student_id] ?? '학생',
        consultType: r.consult_type ? consultTypeFromPrisma(r.consult_type) : null,
        subType: r.sub_type, mode: r.mode, start: r.start_at,
      })),
      questions: questions.map((q) => ({
        id: q.id, studentName: names[q.student_id] ?? '학생',
        body: q.body, assigned: q.assigned_teacher_id === uid, createdAt: q.created_at,
      })),
      notifications,
      unreadByBooking,
    };
  }
}
