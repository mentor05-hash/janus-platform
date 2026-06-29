import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { ShortfallError } from '../../common/errors/shortfall.error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { kstDateString, utcFromKst } from '../../common/time/kst';
import { SLOT_GRANULARITY_MINUTES } from '../../config/constants';
import { AccountRole, BookingStatus, ConsultMode, ConsultType, TeacherGrade } from '../../config/enums';
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
import { AdminPolicyService } from '../pricing-policy/admin-policy.service';
import { BlockService } from '../report/block.service';
import { ZOOM_PROVIDER } from '../zoom/zoom.types';
import type { ZoomProvider } from '../zoom/zoom.types';
import { BookingCreateDto, QuoteDto, ReverseProposeDto } from './dto/booking.dto';
import { canTransition, shouldRefundOnTransition } from './domain/state-machine';
import { canProposeReverse } from './domain/reverse';

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly pricing: PricingService,
    private readonly credit: CreditService,
    private readonly blocks: BlockService,
    private readonly adminPolicy: AdminPolicyService,
    @Inject(ZOOM_PROVIDER) private readonly zoom: ZoomProvider,
  ) {}

  private readonly logger = new Logger(BookingService.name);

  /**
   * §5-8 기능 열기/닫기(FeatureAvailability) + 카테고리×방식(CategoryModePolicy) 게이트.
   * 닫힌 방식/카테고리이거나 허용되지 않은 방식이면 예약 차단.
   */
  private async assertConsultAllowed(centerId: string | null, consultType: ConsultType, mode: ConsultMode) {
    const modeFeature = await this.adminPolicy.resolveFeature(centerId, 'mode', mode);
    if (!modeFeature.enabled) throw new ForbiddenException(`현재 ${mode} 방식은 닫혀 있습니다.`);
    const catFeature = await this.adminPolicy.resolveFeature(centerId, 'category', consultType);
    if (!catFeature.enabled) throw new ForbiddenException(`현재 ${consultType} 상담은 닫혀 있습니다.`);

    if (centerId) {
      const cmp = await this.prisma.category_mode_policy.findFirst({
        where: { center_id: centerId, consult_type: consultTypeToPrisma(consultType) },
      });
      if (cmp && !cmp.allowed_modes.includes(mode)) {
        throw new ForbiddenException(`${consultType} 상담에는 ${mode} 방식을 사용할 수 없습니다.`);
      }
    }
  }

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
    const q = await this.pricing.quoteSession(dto.mode, minutes, teacher.grade as TeacherGrade, teacher.center_id, dto.consultType);
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
    const blocked = await this.blocks.blockedTeacherIds(studentId);
    if (blocked.includes(dto.teacherId)) {
      throw new ForbiddenException('차단한 선생님에게는 예약할 수 없습니다.');
    }
    const teacher = await this.requireTeacher(dto.teacherId);
    await this.assertConsultAllowed(teacher.center_id, dto.consultType, dto.mode); // §5-8 게이트
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

    const q = await this.pricing.quoteSession(dto.mode, minutes, teacher.grade as TeacherGrade, teacher.center_id, dto.consultType);
    const credits = q.credits;
    const startAt = utcFromKst(dto.date, startMin);
    const endAt = utcFromKst(dto.date, endMin);

    try {
      const booking = await this.prisma.$transaction(async (tx) => {
        await this.lockTeacherDate(tx, dto.teacherId, dto.date);
        // 락 확보 후 재검증(§5-1 TOCTOU 방지) — 직렬화되어 권위 있는 판정
        const stillBookable = await this.availability.assertBookable(dto.teacherId, dto.date, startMin, endMin, studentId);
        if (!stillBookable) {
          throw new ConflictException('선택한 시간은 예약할 수 없습니다(휴게/근무/체류 위반).');
        }
        if (dto.mode === ConsultMode.ZOOM) {
          await this.assertZoomCapacity(tx, teacher.center_id, dto.date, startAt, endAt);
        }
        const b = await tx.booking.create({
          data: {
            student_id: studentId,
            teacher_id: dto.teacherId,
            center_id: teacher.center_id,
            consult_type: consultTypeToPrisma(dto.consultType),
            sub_type: dto.subType ?? null,
            mode: dto.mode,
            session_mode: dto.sessionMode ? (sessionModeToPrisma(dto.sessionMode)) : null,
            direction: 'student',
            start_at: startAt,
            end_at: endAt,
            status: BookingStatus.NEW,
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
  async list(user: AuthUser, role?: 'student' | 'teacher', status?: BookingStatus) {
    const asTeacher = role === 'teacher' || user.role === AccountRole.TEACHER;
    const where: Prisma.bookingWhereInput = asTeacher
      ? { teacher_id: user.id }
      : { student_id: user.id };
    if (status) where.status = status;
    const rows = await this.prisma.booking.findMany({
      where,
      orderBy: { start_at: 'desc' },
      take: 100,
    });
    return rows.map((b) => this.toBookingDto(b));
  }

  /** POST /bookings/reverse — 선생님이 학생에게 역상담 제안(첫 상담 한정). 슬롯 점유, 크레딧은 학생 수락 시 차감. */
  async proposeReverse(dto: ReverseProposeDto, user: AuthUser) {
    if (user.role !== AccountRole.TEACHER) {
      throw new ForbiddenException('선생님만 역상담을 제안할 수 있습니다.');
    }
    const minutes = (dto.slotEnd - dto.slotStart) * SLOT_GRANULARITY_MINUTES;
    if (minutes <= 0) throw new BadRequestException('slotEnd 는 slotStart 보다 커야 합니다.');
    const teacher = await this.requireTeacher(user.id);
    await this.assertConsultAllowed(teacher.center_id, dto.consultType, dto.mode); // §5-8 게이트

    const student = await this.prisma.student_profile.findUnique({ where: { account_id: dto.studentId } });
    if (!student) throw new NotFoundException('학생을 찾을 수 없습니다.');

    // 첫 상담 한정(§5-4): 기존 성사 상담(confirmed/done)이 없어야 제안 가능
    const prior = await this.prisma.booking.count({
      where: {
        teacher_id: user.id,
        student_id: dto.studentId,
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.DONE] },
      },
    });
    if (!canProposeReverse(prior)) {
      throw new ConflictException('이미 성사된 상담이 있어 역상담을 제안할 수 없습니다(첫 상담 한정).');
    }

    const startMin = dto.slotStart * SLOT_GRANULARITY_MINUTES;
    const endMin = dto.slotEnd * SLOT_GRANULARITY_MINUTES;
    const bookable = await this.availability.assertBookable(user.id, dto.date, startMin, endMin, dto.studentId);
    if (!bookable) throw new ConflictException('제안하려는 시간은 예약할 수 없습니다(휴게/근무 위반).');

    const q = await this.pricing.quoteSession(dto.mode, minutes, teacher.grade as TeacherGrade, teacher.center_id, dto.consultType);
    const startAt = utcFromKst(dto.date, startMin);
    const endAt = utcFromKst(dto.date, endMin);

    try {
      const booking = await this.prisma.$transaction(async (tx) => {
        await this.lockTeacherDate(tx, user.id, dto.date);
        const stillBookable = await this.availability.assertBookable(user.id, dto.date, startMin, endMin, dto.studentId);
        if (!stillBookable) {
          throw new ConflictException('제안하려는 시간은 예약할 수 없습니다(휴게/근무 위반).');
        }
        if (dto.mode === ConsultMode.ZOOM) {
          await this.assertZoomCapacity(tx, teacher.center_id, dto.date, startAt, endAt);
        }
        const b = await tx.booking.create({
          data: {
            student_id: dto.studentId,
            teacher_id: user.id,
            center_id: teacher.center_id,
            consult_type: consultTypeToPrisma(dto.consultType),
            mode: dto.mode,
            direction: 'reverse',
            start_at: startAt,
            end_at: endAt,
            status: BookingStatus.NEW,
            charged_credits: q.credits,
            origin: '역상담',
            content: dto.content ?? null,
          },
        });
        await tx.time_slot.createMany({
          data: this.sessionSlotIndices(dto.slotStart, dto.slotEnd).map((i) => ({
            teacher_id: user.id,
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
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('이미 예약된 시간입니다.');
      }
      throw e;
    }
  }

  /** PATCH /bookings/{id}/reverse-respond — 학생이 역상담 수락(크레딧 차감·confirmed)/거절(슬롯 해제·rejected). */
  async respondReverse(id: string, action: 'accept' | 'reject', user: AuthUser) {
    const b = await this.prisma.booking.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('예약을 찾을 수 없습니다.');
    if (b.direction !== 'reverse') throw new BadRequestException('역상담 제안이 아닙니다.');
    if (user.role !== AccountRole.STUDENT || b.student_id !== user.id) {
      throw new ForbiddenException('제안 대상 학생만 응답할 수 있습니다.');
    }
    if (b.status !== BookingStatus.NEW) {
      throw new BadRequestException(`응답할 수 없는 상태입니다: ${b.status}`);
    }

    if (action === 'reject') {
      await this.prisma.$transaction(async (tx) => {
        await tx.booking.update({ where: { id }, data: { status: BookingStatus.REJECTED } });
        await tx.time_slot.deleteMany({ where: { booking_id: id } });
      });
      return { id, status: BookingStatus.REJECTED };
    }

    // accept → 크레딧 차감(§5-3) + confirmed
    const credits = b.charged_credits ?? 0;
    try {
      await this.prisma.$transaction(async (tx) => {
        const outcome = await this.credit.consumeWithin(tx, b.student_id, credits, {
          refType: 'booking',
          refId: id,
          description: '역상담 수락 크레딧 차감',
        });
        if (!outcome.ok) throw new ShortfallError(outcome.shortfall);
        await tx.booking.update({ where: { id }, data: { status: BookingStatus.CONFIRMED } });
      });
      await this.issueMeetingUrlIfZoom(id); // §9·§10 zoom 입장 URL
      return { id, status: BookingStatus.CONFIRMED, chargedCredits: credits };
    } catch (e) {
      if (e instanceof ShortfallError) {
        await this.credit.createPaymentRequest(b.student_id, e.shortfall, { refType: 'booking', refId: id });
        throw new HttpException(
          `크레딧이 ${e.shortfall} 부족합니다. 결제요청이 생성되었습니다.`,
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      throw e;
    }
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
    // 관리자는 자기 센터 예약만(타 센터 무단 조작 방지, S4)
    if (user.role === AccountRole.ADMIN && b.center_id && user.centerId && b.center_id !== user.centerId)
      throw new ForbiddenException('다른 센터의 예약은 처리할 수 없습니다.');

    const from = b.status as BookingStatus;
    if (!canTransition(from, to)) {
      throw new BadRequestException(`허용되지 않는 상태 전이: ${from} → ${to}`);
    }

    // 역상담 제안(reverse + NEW)은 크레딧이 아직 소비되지 않았으므로 환원 금지(무료 발급 방지).
    const consumed = !(b.direction === 'reverse' && from === BookingStatus.NEW);
    const refund = shouldRefundOnTransition(from, to) && (b.charged_credits ?? 0) > 0 && consumed;
    // 조건부 상태 전이(§7): updateMany where status=from 으로 동시 전이를 한 번만 적용
    // → 이중 취소/이중 환원·이벤트 중복 방지.
    const applied = await this.prisma.$transaction(async (tx) => {
      const upd = await tx.booking.updateMany({
        where: { id, status: from },
        data: { status: to },
      });
      if (upd.count !== 1) return false; // 다른 트랜잭션이 이미 전이시킴
      if (to === BookingStatus.CANCELLED || to === BookingStatus.REJECTED) {
        await tx.time_slot.deleteMany({ where: { booking_id: id } }); // 슬롯 해제
      }
      // §5-7 가중 제한 카운터 누적 + 오펜스 시각(penalty_since) 기록 — restrict_minutes 해제 기준.
      const now = new Date();
      if (to === BookingStatus.NOSHOW) {
        await tx.student_profile.update({
          where: { account_id: b.student_id },
          data: { noshow_count: { increment: 1 }, penalty_since: now },
        });
      } else if (to === BookingStatus.REJECTED) {
        await tx.student_profile.update({
          where: { account_id: b.student_id },
          data: { rejected_count: { increment: 1 }, penalty_since: now },
        });
      } else if (
        to === BookingStatus.CANCELLED &&
        user.role === AccountRole.STUDENT &&
        b.start_at != null &&
        kstDateString(b.start_at) === kstDateString(now)
      ) {
        // 당일취소(§5-7) — 학생 본인이 세션 당일 취소한 경우만 가중.
        await tx.student_profile.update({
          where: { account_id: b.student_id },
          data: { same_day_cancel_count: { increment: 1 }, penalty_since: now },
        });
      }
      if (refund) {
        await this.credit.refundWithin(tx, b.student_id, b.charged_credits!, {
          refType: 'booking',
          refId: id,
        });
      }
      return true;
    });
    if (!applied) throw new ConflictException('이미 처리된 예약입니다.');
    if (to === BookingStatus.CONFIRMED) await this.issueMeetingUrlIfZoom(id); // §9·§10 zoom 입장 URL
    return { id, status: to, refunded: refund ? b.charged_credits : 0 };
  }

  /** §5-7 가중 제한: 노쇼·과다거절 임계 초과 학생은 신규 예약 차단. */
  private async assertNotPenaltyRestricted(studentId: string) {
    const sp = await this.prisma.student_profile.findUnique({ where: { account_id: studentId } });
    if (!sp?.center_id) return;
    const pp = await this.prisma.penalty_policy.findUnique({ where: { center_id: sp.center_id } });
    if (!pp) return;
    const result = evaluatePenalty(
      {
        cancelCount: sp.same_day_cancel_count ?? 0,
        noshowCount: sp.noshow_count ?? 0,
        rejectCount: sp.rejected_count ?? 0,
      },
      {
        cancelThreshold: pp.cancel_threshold,
        noshowThreshold: pp.noshow_threshold,
        rejectThreshold: pp.reject_threshold,
        rankingWeightDown: pp.ranking_weight_down == null ? null : Number(pp.ranking_weight_down),
      },
      {
        restrictMinutes: pp.restrict_minutes,
        penaltySinceMs: sp.penalty_since ? sp.penalty_since.getTime() : null,
        nowMs: Date.now(),
      },
    );
    if (result.restricted) {
      throw new ForbiddenException(`가중 제한으로 신규 예약이 일시 제한되었습니다(${result.reasons.join(',')}).`);
    }
  }

  private sessionSlotIndices(start: number, end: number): number[] {
    return Array.from({ length: end - start }, (_, k) => start + k);
  }

  /**
   * (teacher, date) 단위 advisory xact lock — §5-1 휴게버퍼 TOCTOU 방지.
   * 락 확보 후 버퍼 재검증을 직렬화해 동시 인접 예약을 차단한다(트랜잭션 종료 시 자동 해제).
   */
  private async lockTeacherDate(tx: Prisma.TransactionClient, teacherId: string, date: string) {
    const key = `${teacherId}:${date}`;
    // $executeRaw 사용: void 반환 컬럼 역직렬화 회피(락은 실행 시 획득).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }

  /**
   * 줌 동시 진행 한도(§5-8, ZoomPolicy.concurrent_limit) — 센터 단위.
   * 같은 센터에서 요청 시간대와 겹치는 진행 예정 줌 예약 수가 한도 이상이면 차단.
   * 센터:날짜 advisory 락으로 교차-선생님 동시 생성까지 직렬화.
   */
  private async assertZoomCapacity(
    tx: Prisma.TransactionClient,
    centerId: string | null,
    date: string,
    startAt: Date,
    endAt: Date,
  ) {
    if (!centerId) return;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`zoom:${centerId}:${date}`}))`;
    const zp = await tx.zoom_policy.findUnique({ where: { center_id: centerId } });
    const limit = zp?.concurrent_limit ?? 6;
    const overlapping = await tx.booking.count({
      where: {
        center_id: centerId,
        mode: ConsultMode.ZOOM,
        status: { in: [BookingStatus.NEW, BookingStatus.CONFIRMED] },
        start_at: { lt: endAt },
        end_at: { gt: startAt },
      },
    });
    if (overlapping >= limit) {
      throw new ConflictException(`동시 진행 가능한 줌 상담 수(${limit})를 초과했습니다.`);
    }
  }

  /**
   * zoom 예약 확정 시 입장 URL 발급(§9·§10). 트랜잭션 외부에서 호출(외부 호출이 DB tx 를 늘리지 않도록).
   * 이미 발급됐으면(idempotent) 생략. 발급 실패는 확정을 막지 않고 로그만(추후 재발급 가능).
   */
  private async issueMeetingUrlIfZoom(bookingId: string) {
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!b || b.mode !== ConsultMode.ZOOM || b.meeting_url) return;
    try {
      const { joinUrl } = await this.zoom.issueJoinUrl({
        bookingId: b.id,
        startAt: b.start_at,
        endAt: b.end_at,
      });
      await this.prisma.booking.update({ where: { id: b.id }, data: { meeting_url: joinUrl } });
    } catch (e) {
      this.logger.warn(`입장 URL 발급 실패(booking=${bookingId}): ${(e as Error).message}`);
    }
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
    meeting_url?: string | null;
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
      meetingUrl: b.meeting_url ?? null,
    };
  }
}
