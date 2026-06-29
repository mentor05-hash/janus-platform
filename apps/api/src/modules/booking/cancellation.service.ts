import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { kstDateString, kstMinutesOfDay } from '../../common/time/kst';
import { AccountRole, BookingStatus, CancelRoute } from '../../config/enums';
import { AvailabilityService } from '../availability/availability.service';
import { CreditService } from '../billing/credit.service';
import { NOTIFICATION_PROVIDER } from '../notification/notification.types';
import type { NotificationProvider, NotifyChannel } from '../notification/notification.types';
import { canTransition } from './domain/state-machine';
import { NotifyTarget, planTeacherCancellation } from './domain/cancellation';

const ALL_CHANNELS: NotifyChannel[] = ['app', 'sms', 'kakao'];

export interface CancelWithReason {
  reason?: string;
  route: CancelRoute;
}

/**
 * 선생님 사유 취소 (CLAUDE.md §5-6).
 * 취소→CancellationEvent 생성→크레딧 환원→슬롯 해제(동일 트랜잭션, §7) → 알림 발송(커밋 후).
 */
@Injectable()
export class CancellationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly credit: CreditService,
    @Inject(NOTIFICATION_PROVIDER) private readonly notifier: NotificationProvider,
  ) {}

  async teacherCancel(bookingId: string, dto: CancelWithReason, user: AuthUser) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('예약을 찾을 수 없습니다.');
    if (user.role !== AccountRole.TEACHER || booking.teacher_id !== user.id) {
      throw new ForbiddenException('담당 선생님만 사유 취소를 할 수 있습니다.');
    }
    const from = booking.status as BookingStatus;
    if (!canTransition(from, BookingStatus.CANCELLED)) {
      throw new BadRequestException(`취소할 수 없는 상태입니다: ${from}`);
    }

    const plan = planTeacherCancellation(dto.route);
    // 역상담 제안(reverse + NEW)은 미차감 상태 → 환원 금지(무료 발급 방지).
    const consumed = !(booking.direction === 'reverse' && from === BookingStatus.NEW);
    const refundAmount = plan.refund && consumed ? (booking.charged_credits ?? 0) : 0;

    // 대체후보 탐색(substitute/priority) — 알림/이벤트 기록용
    const substitutes = plan.needsSubstitutes ? await this.findSubstitutes(booking) : [];

    // ── 원자적 처리(§7): 상태변경 · 슬롯해제 · 환원 · 이벤트기록 ──
    const event = await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id: bookingId }, data: { status: BookingStatus.CANCELLED as never } });
      await tx.time_slot.deleteMany({ where: { booking_id: bookingId } });
      if (refundAmount > 0) {
        await this.credit.refundWithin(tx, booking.student_id, refundAmount, {
          refType: 'cancellation',
          refId: bookingId,
        });
      }
      return tx.cancellation_event.create({
        data: {
          booking_id: bookingId,
          reason: dto.reason ?? null,
          route: dto.route as never,
          notify_targets: plan.notifyTargets,
          channels: ALL_CHANNELS,
          credit_refunded: refundAmount,
          cancelled_by: user.id,
          substitute_candidates: substitutes,
        },
      });
    });

    // ── 알림 발송(커밋 후, 외부 부수효과) ──
    const recipients = await this.resolveRecipients(
      plan.notifyTargets,
      booking.student_id,
      booking.center_id,
      substitutes,
    );
    await Promise.all(
      recipients.map((recipientId) =>
        this.notifier.send({
          recipientId,
          type: 'cancel',
          channels: ALL_CHANNELS,
          payload: { bookingId, route: dto.route, reason: dto.reason ?? null },
        }),
      ),
    );

    return {
      eventId: event.id,
      route: dto.route,
      refunded: refundAmount,
      notified: recipients.length,
      substituteCandidates: substitutes,
    };
  }

  /** 같은 센터의 다른 선생님 중 동일 시간대에 가용한 후보. */
  private async findSubstitutes(booking: {
    teacher_id: string;
    center_id: string | null;
    student_id: string;
    start_at: Date | null;
    end_at: Date | null;
  }): Promise<string[]> {
    if (!booking.start_at || !booking.end_at) return [];
    const dateStr = kstDateString(booking.start_at);
    const startMin = kstMinutesOfDay(booking.start_at);
    const endMin = kstMinutesOfDay(booking.end_at);

    const others = await this.prisma.teacher_profile.findMany({
      where: {
        account_id: { not: booking.teacher_id },
        ...(booking.center_id ? { center_id: booking.center_id } : {}),
      },
      select: { account_id: true },
    });

    const candidates: string[] = [];
    for (const t of others) {
      const ok = await this.availability.assertBookable(
        t.account_id,
        dateStr,
        startMin,
        endMin,
        booking.student_id,
      );
      if (ok) candidates.push(t.account_id);
      if (candidates.length >= 3) break; // 상위 후보만
    }
    return candidates;
  }

  /** 알림 대상(account id) 해석: student/guardian/admin/substitute. */
  private async resolveRecipients(
    targets: NotifyTarget[],
    studentId: string,
    centerId: string | null,
    substitutes: string[],
  ): Promise<string[]> {
    const ids = new Set<string>();
    if (targets.includes('student')) ids.add(studentId);
    if (targets.includes('guardian')) {
      const links = await this.prisma.guardian_student_link.findMany({
        where: { student_id: studentId, status: 'approved' },
        select: { guardian_id: true },
      });
      links.forEach((l) => ids.add(l.guardian_id));
    }
    if (targets.includes('admin')) {
      const admins = await this.prisma.account.findMany({
        where: { role: 'admin', ...(centerId ? { center_id: centerId } : {}) },
        select: { id: true },
      });
      admins.forEach((a) => ids.add(a.id));
    }
    if (targets.includes('substitute')) substitutes.forEach((s) => ids.add(s));
    return [...ids];
  }
}
