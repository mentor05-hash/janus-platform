import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { kstDateString, kstMinutesOfDay } from '../../common/time/kst';
import { AccountRole, BookingStatus, CancelRoute } from '../../config/enums';
import { consultTypeFromPrisma } from '../../config/prisma-enums';
import { SLOT_GRANULARITY_MINUTES } from '../../config/constants';
import { AvailabilityService } from '../availability/availability.service';
import { CreditService } from '../billing/credit.service';
import { PricingService } from '../pricing-policy/pricing.service';
import { NOTIFICATION_PROVIDER } from '../notification/notification.types';
import type {
  NotificationProvider,
  NotifyChannel,
} from '../notification/notification.types';
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
    private readonly pricing: PricingService,
    @Inject(NOTIFICATION_PROVIDER)
    private readonly notifier: NotificationProvider,
  ) {}

  async teacherCancel(
    bookingId: string,
    dto: CancelWithReason,
    user: AuthUser,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException('예약을 찾을 수 없습니다.');
    if (user.role !== AccountRole.TEACHER || booking.teacher_id !== user.id) {
      throw new ForbiddenException('담당 선생님만 사유 취소를 할 수 있습니다.');
    }
    const from = booking.status;
    if (!canTransition(from, BookingStatus.CANCELLED)) {
      throw new BadRequestException(`취소할 수 없는 상태입니다: ${from}`);
    }

    const plan = planTeacherCancellation(dto.route);
    // 역상담 제안(reverse + NEW)은 미차감 상태 → 환원 금지(무료 발급 방지).
    const consumed = !(
      booking.direction === 'reverse' && from === BookingStatus.NEW
    );
    const refundAmount =
      plan.refund && consumed ? (booking.charged_credits ?? 0) : 0;

    // 대체후보 탐색(substitute/priority) — 알림/이벤트 기록용
    const substitutes = plan.needsSubstitutes
      ? await this.findSubstitutes(booking)
      : [];

    // ── 원자적 처리(§7): 조건부 상태변경 · 슬롯해제 · 환원 · 이벤트기록 ──
    // updateMany where status=from 으로 동시 취소를 한 번만 적용(이중 환원·이벤트 중복 방지).
    const event = await this.prisma.$transaction(async (tx) => {
      const upd = await tx.booking.updateMany({
        where: { id: bookingId, status: from },
        data: { status: BookingStatus.CANCELLED },
      });
      if (upd.count !== 1) {
        throw new ConflictException('이미 처리된 예약입니다.');
      }
      await tx.time_slot.deleteMany({ where: { booking_id: bookingId } });
      // 교사 사유 취소 누적 → 검색 랭킹 가중치 하락(§5-7).
      await tx.teacher_profile.update({
        where: { account_id: booking.teacher_id },
        data: { cancel_count: { increment: 1 } },
      });
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
          route: dto.route,
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

    // ── priority(우선권 자동배정): 상위 후보로 같은 시간·방식 새 예약을 자동 생성 ──
    // 크레딧 부족·슬롯 경합 시 자동배정을 건너뛰고 후보 알림만(=substitute 폴백, §5-6).
    let reassignedBookingId: string | null = null;
    if (dto.route === 'priority' && substitutes.length > 0) {
      reassignedBookingId = await this.tryPriorityReassign(booking, substitutes[0]);
      if (reassignedBookingId) {
        await this.notifier.send({
          recipientId: booking.student_id,
          type: 'auto_reassigned',
          channels: ALL_CHANNELS,
          payload: { bookingId: reassignedBookingId, teacherId: substitutes[0], from: bookingId },
        });
      }
    }

    return {
      eventId: event.id,
      route: dto.route,
      refunded: refundAmount,
      notified: recipients.length,
      substituteCandidates: substitutes,
      reassignedBookingId,
    };
  }

  /**
   * priority 자동배정: 상위 대체 후보로 동일 학생·시간·방식의 새 예약(confirmed)을 생성.
   * 대체 교사 요금으로 재견적·재차감(트랜잭션). 부족/경합이면 null 반환 → 자동배정 생략(폴백).
   */
  private async tryPriorityReassign(
    booking: {
      student_id: string;
      center_id: string | null;
      start_at: Date | null;
      end_at: Date | null;
      consult_type: string;
      sub_type: string | null;
      mode: string;
      session_mode: string | null;
    },
    substituteId: string,
  ): Promise<string | null> {
    if (!booking.start_at || !booking.end_at) return null;
    const teacher = await this.prisma.teacher_profile.findUnique({
      where: { account_id: substituteId },
      select: { grade: true, center_id: true },
    });
    if (!teacher) return null;
    const dateStr = kstDateString(booking.start_at);
    const startMin = kstMinutesOfDay(booking.start_at);
    const endMin = kstMinutesOfDay(booking.end_at);
    const minutes = endMin - startMin;
    if (minutes <= 0) return null;
    const consultType = consultTypeFromPrisma(booking.consult_type) ?? undefined;
    const q = await this.pricing.quoteSession(
      booking.mode as never,
      minutes,
      teacher.grade as never,
      teacher.center_id,
      consultType as never,
    );
    const slotStart = startMin / SLOT_GRANULARITY_MINUTES;
    const slotEnd = endMin / SLOT_GRANULARITY_MINUTES;
    const indices = Array.from({ length: slotEnd - slotStart }, (_, k) => slotStart + k);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const bookable = await this.availability.assertBookable(
          substituteId,
          dateStr,
          startMin,
          endMin,
          booking.student_id,
        );
        if (!bookable) return null;
        const b = await tx.booking.create({
          data: {
            student_id: booking.student_id,
            teacher_id: substituteId,
            center_id: teacher.center_id,
            consult_type: booking.consult_type as never,
            sub_type: booking.sub_type,
            mode: booking.mode as never,
            session_mode: booking.session_mode as never,
            direction: 'student',
            start_at: booking.start_at,
            end_at: booking.end_at,
            status: BookingStatus.CONFIRMED,
            charged_credits: q.credits,
            origin: '우선배정',
          },
        });
        const outcome = await this.credit.consumeWithin(tx, booking.student_id, q.credits, {
          refType: 'booking',
          refId: b.id,
          description: '우선권 자동배정 크레딧 차감',
        });
        if (!outcome.ok) throw new Error('shortfall'); // 롤백 → 폴백
        await tx.time_slot.createMany({
          data: indices.map((i) => ({
            teacher_id: substituteId,
            slot_date: new Date(dateStr),
            slot_index: i,
            status: 'booked',
            booking_id: b.id,
          })),
        });
        return b.id;
      });
    } catch {
      return null; // 크레딧 부족·슬롯 경합 → 자동배정 생략
    }
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
