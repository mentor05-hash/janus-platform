import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { utcFromKst } from '../../common/time/kst';
import { SLOT_GRANULARITY_MINUTES } from '../../config/constants';
import { AccountRole, BookingStatus, ConsultMode, TeacherGrade } from '../../config/enums';
import {
  consultTypeFromPrisma,
  consultTypeToPrisma,
  sessionModeFromPrisma,
  sessionModeToPrisma,
} from '../../config/prisma-enums';
import { AvailabilityService } from '../availability/availability.service';
import { CreditService } from '../billing/credit.service';
import { evaluatePenalty } from '../pricing-policy/domain/penalty';
import { PricingService } from '../pricing-policy/pricing.service';
import { BookingCreateDto, QuoteDto } from './dto/booking.dto';
import { canTransition, shouldRefundOnTransition } from './domain/state-machine';

class ShortfallError extends Error {
  constructor(public readonly shortfall: number) {
    super('INSUFFICIENT_CREDITS');
  }
}

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly pricing: PricingService,
    private readonly credit: CreditService,
  ) {}

  /** POST /bookings/quote — 요금·유효성(§5-1 버퍼 재검증 + §5-2 요금). */
  async quote(dto: QuoteDto, user: AuthUser) {
    const minutes = (dto.slotEnd - dto.slotStart) * SLOT_GRANULARITY_MINUTES;
    if (minutes <= 0) throw new BadRequestException('slotEnd 는 slotStart 보다 커야 합니다.');
    const teacher = await this.requireTeacher(dto.teacherId);
    const studentId = user.role === AccountRole.STUDENT ? user.id : undefined;

    const valid = await this.availability.assertBookable(
      dto.teacherId,
      dto.date,
      dto.slotStart * SLOT_GRANULARITY_MINUTES,
      dto.slotEnd * SLOT_GRANULARITY_MINUTES,
      studentId,
    );
    const q = await this.pricing.quoteSession(dto.mode, minutes, teacher.grade as TeacherGrade);
    return {
      minutes,
      credits: q.credits,
      valid,
      message: valid ? '예약 가능' : '선택한 시간은 예약할 수 없습니다(휴게/근무/체류 위반).',
    };
  }

  /** POST /bookings — 예약 생성. 트랜잭션 + 슬롯 UNIQUE 로 동시성 보호, 크레딧 차감(§5-3). */
  async create(dto: BookingCreateDto, user: AuthUser) {
    if (user.role !== AccountRole.STUDENT) {
      throw new ForbiddenException('학생만 예약을 생성할 수 있습니다.');
    }
    const studentId = user.id;
    const minutes = (dto.slotEnd - dto.slotStart) * SLOT_GRANULARITY_MINUTES;
    if (minutes <= 0) throw new BadRequestException('slotEnd 는 slotStart 보다 커야 합니다.');

    await this.assertNotPenaltyRestricted(studentId); // §5-7 가중 제한
    const teacher = await this.requireTeacher(dto.teacherId);
    const startMin = dto.slotStart * SLOT_GRANULARITY_MINUTES;
    const endMin = dto.slotEnd * SLOT_GRANULARITY_MINUTES;

    const bookable = await this.availability.assertBookable(
      dto.teacherId,
      dto.date,
      startMin,
      endMin,
      studentId,
    );
    if (!bookable) {
      throw new ConflictException('선택한 시간은 예약할 수 없습니다(휴게/근무/체류 위반).');
    }

    const q = await this.pricing.quoteSession(dto.mode, minutes, teacher.grade as TeacherGrade);
    const credits = q.credits;
    const startAt = utcFromKst(dto.date, startMin);
    const endAt = utcFromKst(dto.date, endMin);

    try {
      const booking = await this.prisma.$transaction(async (tx) => {
        const b = await tx.booking.create({
          data: {
            student_id: studentId,
            teacher_id: dto.teacherId,
            center_id: teacher.center_id,
            consult_type: consultTypeToPrisma(dto.consultType) as never,
            sub_type: dto.subType ?? null,
            mode: dto.mode as never,
            session_mode: dto.sessionMode ? (sessionModeToPrisma(dto.sessionMode) as never) : null,
            direction: 'student',
            start_at: startAt,
            end_at: endAt,
            status: BookingStatus.NEW as never,
            charged_credits: credits,
            origin: '직접',
            content: dto.content ?? null,
          },
        });

        const outcome = await this.credit.consumeWithin(tx, studentId, credits, {
          refType: 'booking',
          refId: b.id,
          description: '상담 예약 크레딧 차감',
        });
        if (!outcome.ok) throw new ShortfallError(outcome.shortfall);

        await tx.time_slot.createMany({
          data: this.sessionSlotIndices(dto.slotStart, dto.slotEnd).map((i) => ({
            teacher_id: dto.teacherId,
            slot_date: new Date(dto.date),
            slot_index: i,
            status: 'booked',
            booking_id: b.id,
          })),
        });
        return b;
      });
      return this.toBookingDto(booking);
    } catch (e) {
      if (e instanceof ShortfallError) {
        await this.credit.createPaymentRequest(studentId, e.shortfall, { refType: 'booking' });
        throw new HttpException(
          `크레딧이 ${e.shortfall} 부족합니다. 결제요청이 생성되었습니다.`,
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('이미 예약된 시간입니다.');
      }
      throw e;
    }
  }

  /** GET /bookings — 역할별 목록. */
  async list(user: AuthUser, role?: 'student' | 'teacher', status?: string) {
    const asTeacher = role === 'teacher' || user.role === AccountRole.TEACHER;
    const where: Prisma.bookingWhereInput = asTeacher
      ? { teacher_id: user.id }
      : { student_id: user.id };
    if (status) where.status = status as never;
    const rows = await this.prisma.booking.findMany({
      where,
      orderBy: { start_at: 'desc' },
      take: 100,
    });
    return rows.map((b) => this.toBookingDto(b));
  }

  // ── 상태 전이 (§5-4) ──
  accept(id: string, user: AuthUser) {
    return this.transition(id, BookingStatus.CONFIRMED, user, [AccountRole.TEACHER]);
  }
  confirm(id: string, user: AuthUser) {
    return this.transition(id, BookingStatus.CONFIRMED, user, [AccountRole.TEACHER, AccountRole.ADMIN]);
  }
  reject(id: string, user: AuthUser) {
    return this.transition(id, BookingStatus.REJECTED, user, [AccountRole.TEACHER]);
  }
  async complete(id: string, user: AuthUser) {
    // §5-5: 완료(done)는 상담 기록 final 저장이 선행되어야 한다.
    const note = await this.prisma.consultation_note.findUnique({ where: { booking_id: id } });
    if (!note || note.save_state !== 'final') {
      throw new BadRequestException('완료 전에 상담 기록을 final 로 저장해야 합니다.');
    }
    return this.transition(id, BookingStatus.DONE, user, [AccountRole.TEACHER]);
  }
  noshow(id: string, user: AuthUser) {
    return this.transition(id, BookingStatus.NOSHOW, user, [AccountRole.TEACHER]);
  }
  cancel(id: string, user: AuthUser) {
    return this.transition(id, BookingStatus.CANCELLED, user, [
      AccountRole.STUDENT,
      AccountRole.TEACHER,
      AccountRole.ADMIN,
    ]);
  }

  private async transition(
    id: string,
    to: BookingStatus,
    user: AuthUser,
    allowedRoles: AccountRole[],
  ) {
    const b = await this.prisma.booking.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('예약을 찾을 수 없습니다.');
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException('이 작업을 수행할 권한이 없습니다.');
    }
    // 소유권: 학생/선생님은 본인 예약만
    if (user.role === AccountRole.STUDENT && b.student_id !== user.id)
      throw new ForbiddenException('본인 예약이 아닙니다.');
    if (user.role === AccountRole.TEACHER && b.teacher_id !== user.id)
      throw new ForbiddenException('본인 예약이 아닙니다.');

    const from = b.status as BookingStatus;
    if (!canTransition(from, to)) {
      throw new BadRequestException(`허용되지 않는 상태 전이: ${from} → ${to}`);
    }

    const refund = shouldRefundOnTransition(from, to) && (b.charged_credits ?? 0) > 0;
    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id }, data: { status: to as never } });
      if (to === BookingStatus.CANCELLED || to === BookingStatus.REJECTED) {
        await tx.time_slot.deleteMany({ where: { booking_id: id } }); // 슬롯 해제
      }
      // §5-6 환원을 상태변경과 동일 트랜잭션으로 — 취소/환원 불일치 방지
      if (refund) {
        await this.credit.refundWithin(tx, b.student_id, b.charged_credits!, {
          refType: 'booking',
          refId: id,
        });
      }
    });
    return { id, status: to, refunded: refund ? b.charged_credits : 0 };
  }

  /** §5-7 가중 제한: 노쇼·과다거절 임계 초과 학생은 신규 예약 차단. */
  private async assertNotPenaltyRestricted(studentId: string) {
    const sp = await this.prisma.student_profile.findUnique({ where: { account_id: studentId } });
    if (!sp?.center_id) return;
    const pp = await this.prisma.penalty_policy.findUnique({ where: { center_id: sp.center_id } });
    if (!pp) return;
    const result = evaluatePenalty(
      { cancelCount: 0, noshowCount: sp.noshow_count ?? 0, rejectCount: sp.rejected_count ?? 0 },
      {
        cancelThreshold: pp.cancel_threshold,
        noshowThreshold: pp.noshow_threshold,
        rejectThreshold: pp.reject_threshold,
        rankingWeightDown: pp.ranking_weight_down == null ? null : Number(pp.ranking_weight_down),
      },
    );
    if (result.restricted) {
      throw new ForbiddenException(`가중 제한으로 신규 예약이 일시 제한되었습니다(${result.reasons.join(',')}).`);
    }
  }

  private sessionSlotIndices(start: number, end: number): number[] {
    return Array.from({ length: end - start }, (_, k) => start + k);
  }

  private async requireTeacher(teacherId: string) {
    const t = await this.prisma.teacher_profile.findUnique({ where: { account_id: teacherId } });
    if (!t) throw new NotFoundException('선생님을 찾을 수 없습니다.');
    return t;
  }

  private toBookingDto(b: {
    id: string;
    student_id: string;
    teacher_id: string;
    consult_type: string;
    sub_type: string | null;
    mode: string;
    session_mode: string | null;
    direction: string;
    start_at: Date | null;
    end_at: Date | null;
    status: string;
    charged_credits: number | null;
  }) {
    return {
      id: b.id,
      studentId: b.student_id,
      teacherId: b.teacher_id,
      consultType: consultTypeFromPrisma(b.consult_type),
      subType: b.sub_type,
      mode: b.mode,
      sessionMode: sessionModeFromPrisma(b.session_mode),
      direction: b.direction,
      start: b.start_at?.toISOString() ?? null,
      end: b.end_at?.toISOString() ?? null,
      status: b.status,
      chargedCredits: b.charged_credits ?? 0,
    };
  }
}
