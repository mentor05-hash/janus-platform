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
import {
  AccountRole,
  BookingStatus,
  ConsultMode,
  ConsultType,
  TeacherGrade,
} from '../../config/enums';
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
import { NotifyService } from '../notification/notify.service';
import { ZOOM_PROVIDER } from '../zoom/zoom.types';
import type { ZoomProvider } from '../zoom/zoom.types';
import {
  BookingCreateDto,
  QuoteDto,
  ReverseProposeDto,
} from './dto/booking.dto';
import {
  canTransition,
  shouldRefundOnTransition,
} from './domain/state-machine';
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
    private readonly notify: NotifyService,
  ) {}

  private readonly logger = new Logger(BookingService.name);

  /**
   * §5-8 기능 열기/닫기(FeatureAvailability) + 카테고리×방식(CategoryModePolicy) 게이트.
   * 닫힌 방식/카테고리이거나 허용되지 않은 방식이면 예약 차단.
   */
  private async assertConsultAllowed(
    centerId: string | null,
    consultType: ConsultType,
    mode: ConsultMode,
  ) {
    const modeFeature = await this.adminPolicy.resolveFeature(
      centerId,
      'mode',
      mode,
    );
    if (!modeFeature.enabled)
      throw new ForbiddenException(`현재 ${mode} 방식은 닫혀 있습니다.`);
    const catFeature = await this.adminPolicy.resolveFeature(
      centerId,
      'category',
      consultType,
    );
    if (!catFeature.enabled)
      throw new ForbiddenException(`현재 ${consultType} 상담은 닫혀 있습니다.`);

    if (centerId) {
      const cmp = await this.prisma.category_mode_policy.findFirst({
        where: {
          center_id: centerId,
          consult_type: consultTypeToPrisma(consultType),
        },
      });
      if (cmp && !cmp.allowed_modes.includes(mode)) {
        throw new ForbiddenException(
          `${consultType} 상담에는 ${mode} 방식을 사용할 수 없습니다.`,
        );
      }
    }
  }

  /** POST /bookings/quote — 요금·유효성(§5-1 버퍼 재검증 + §5-2 요금). */
  async quote(dto: QuoteDto, user: AuthUser) {
    const minutes = (dto.slotEnd - dto.slotStart) * SLOT_GRANULARITY_MINUTES;
    if (minutes <= 0)
      throw new BadRequestException('slotEnd 는 slotStart 보다 커야 합니다.');
    const teacher = await this.requireTeacher(dto.teacherId);
    const studentId = user.role === AccountRole.STUDENT ? user.id : undefined;
    if (studentId) await this.requireStudent(studentId); // 미등록 승인계정 견적 시 500 방지

    const valid = await this.availability.assertBookable(
      dto.teacherId,
      dto.date,
      dto.slotStart * SLOT_GRANULARITY_MINUTES,
      dto.slotEnd * SLOT_GRANULARITY_MINUTES,
      studentId,
    );
    const q = await this.pricing.quoteSession(
      dto.mode,
      minutes,
      teacher.grade,
      teacher.center_id,
      dto.consultType,
    );
    return {
      minutes,
      credits: q.credits,
      valid,
      message: valid
        ? '예약 가능'
        : '선택한 시간은 예약할 수 없습니다(휴게/근무/체류 위반).',
    };
  }

  /** POST /bookings — 예약 생성. 트랜잭션 + 슬롯 UNIQUE 로 동시성 보호, 크레딧 차감(§5-3). */
  async create(dto: BookingCreateDto, user: AuthUser) {
    if (user.role !== AccountRole.STUDENT) {
      throw new ForbiddenException('학생만 예약을 생성할 수 있습니다.');
    }
    const studentId = user.id;
    const minutes = (dto.slotEnd - dto.slotStart) * SLOT_GRANULARITY_MINUTES;
    if (minutes <= 0)
      throw new BadRequestException('slotEnd 는 slotStart 보다 커야 합니다.');

    await this.requireStudent(studentId); // 회원등록(프로필) 선행 — 미등록 승인계정 500 방지
    await this.assertNotPenaltyRestricted(studentId); // §5-7 가중 제한
    const blocked = await this.blocks.blockedTeacherIds(studentId);
    if (blocked.includes(dto.teacherId)) {
      throw new ForbiddenException('차단한 선생님에게는 예약할 수 없습니다.');
    }
    const teacher = await this.requireTeacher(dto.teacherId);
    await this.assertConsultAllowed(
      teacher.center_id,
      dto.consultType,
      dto.mode,
    ); // §5-8 게이트
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
      throw new ConflictException(
        '선택한 시간은 예약할 수 없습니다(휴게/근무/체류 위반).',
      );
    }

    const q = await this.pricing.quoteSession(
      dto.mode,
      minutes,
      teacher.grade,
      teacher.center_id,
      dto.consultType,
    );
    const credits = q.credits;
    const startAt = utcFromKst(dto.date, startMin);
    const endAt = utcFromKst(dto.date, endMin);

    try {
      const booking = await this.prisma.$transaction(async (tx) => {
        await this.lockTeacherDate(tx, dto.teacherId, dto.date);
        // 락 확보 후 재검증(§5-1 TOCTOU 방지) — 직렬화되어 권위 있는 판정
        const stillBookable = await this.availability.assertBookable(
          dto.teacherId,
          dto.date,
          startMin,
          endMin,
          studentId,
        );
        if (!stillBookable) {
          throw new ConflictException(
            '선택한 시간은 예약할 수 없습니다(휴게/근무/체류 위반).',
          );
        }
        if (dto.mode === ConsultMode.ZOOM) {
          await this.assertZoomCapacity(
            tx,
            teacher.center_id,
            dto.date,
            startAt,
            endAt,
          );
        }
        // 오프라인 상담실 배정(§5 상담실) — 센터 내 시간대 미점유 방을 선정.
        let roomId: string | null = null;
        if (dto.mode === ConsultMode.OFFLINE) {
          roomId = await this.assignRoom(
            tx,
            teacher.center_id,
            dto.date,
            startAt,
            endAt,
          );
        }
        const b = await tx.booking.create({
          data: {
            student_id: studentId,
            teacher_id: dto.teacherId,
            center_id: teacher.center_id,
            consult_type: consultTypeToPrisma(dto.consultType),
            sub_type: dto.subType ?? null,
            mode: dto.mode,
            session_mode: dto.sessionMode
              ? sessionModeToPrisma(dto.sessionMode)
              : null,
            direction: 'student',
            start_at: startAt,
            end_at: endAt,
            status: BookingStatus.NEW,
            room_id: roomId,
            charged_credits: credits,
            origin: '직접',
            content: dto.content ?? null,
          },
        });

        const outcome = await this.credit.consumeWithin(
          tx,
          studentId,
          credits,
          {
            refType: 'booking',
            refId: b.id,
            description: '상담 예약 크레딧 차감',
          },
        );
        if (!outcome.ok) throw new ShortfallError(outcome.shortfall);

        await tx.time_slot.createMany({
          data: this.sessionSlotIndices(dto.slotStart, dto.slotEnd).map(
            (i) => ({
              teacher_id: dto.teacherId,
              slot_date: new Date(dto.date),
              slot_index: i,
              status: 'booked',
              booking_id: b.id,
            }),
          ),
        });
        return b;
      });
      // 상담 신청 들어옴 → 선생님 알림
      await this.notify.notify(dto.teacherId, 'booking_requested', {
        bookingId: booking.id,
        studentId,
        date: dto.date,
      });
      return this.toBookingDto(booking);
    } catch (e) {
      if (e instanceof ShortfallError) {
        await this.credit.createPaymentRequest(studentId, e.shortfall, {
          refType: 'booking',
        });
        throw new HttpException(
          `크레딧이 ${e.shortfall} 부족합니다. 결제요청이 생성되었습니다.`,
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('이미 예약된 시간입니다.');
      }
      throw e;
    }
  }

  /** GET /bookings — 역할별 목록. */
  async list(
    user: AuthUser,
    role?: 'student' | 'teacher',
    status?: BookingStatus,
  ) {
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
    if (minutes <= 0)
      throw new BadRequestException('slotEnd 는 slotStart 보다 커야 합니다.');
    const teacher = await this.requireTeacher(user.id);
    await this.assertConsultAllowed(
      teacher.center_id,
      dto.consultType,
      dto.mode,
    ); // §5-8 게이트

    const student = await this.prisma.student_profile.findUnique({
      where: { account_id: dto.studentId },
    });
    if (!student) throw new NotFoundException('학생을 찾을 수 없습니다.');

    // 역상담 대상 자격(§5-4 확장): 아래 3종 중 하나면 제안 가능
    //  (1) 첫 상담 — 이 선생님과 성사 상담(confirmed/done)이 없음
    //  (2) 관리자 지정(reverse_admin) — 추가 역상담 허용
    //  (3) 학생 신청(reverse_self) — 추가 역상담 허용
    const prior = await this.prisma.booking.count({
      where: {
        teacher_id: user.id,
        student_id: dto.studentId,
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.DONE] },
      },
    });
    const eligible =
      canProposeReverse(prior) || student.reverse_admin || student.reverse_self;
    if (!eligible) {
      throw new ConflictException(
        '역상담 대상이 아닙니다(첫 상담·관리자 지정·학생 신청에 해당해야 합니다).',
      );
    }

    const startMin = dto.slotStart * SLOT_GRANULARITY_MINUTES;
    const endMin = dto.slotEnd * SLOT_GRANULARITY_MINUTES;
    const bookable = await this.availability.assertBookable(
      user.id,
      dto.date,
      startMin,
      endMin,
      dto.studentId,
    );
    if (!bookable)
      throw new ConflictException(
        '제안하려는 시간은 예약할 수 없습니다(휴게/근무 위반).',
      );

    const q = await this.pricing.quoteSession(
      dto.mode,
      minutes,
      teacher.grade,
      teacher.center_id,
      dto.consultType,
    );
    const startAt = utcFromKst(dto.date, startMin);
    const endAt = utcFromKst(dto.date, endMin);

    try {
      const booking = await this.prisma.$transaction(async (tx) => {
        await this.lockTeacherDate(tx, user.id, dto.date);
        const stillBookable = await this.availability.assertBookable(
          user.id,
          dto.date,
          startMin,
          endMin,
          dto.studentId,
        );
        if (!stillBookable) {
          throw new ConflictException(
            '제안하려는 시간은 예약할 수 없습니다(휴게/근무 위반).',
          );
        }
        if (dto.mode === ConsultMode.ZOOM) {
          await this.assertZoomCapacity(
            tx,
            teacher.center_id,
            dto.date,
            startAt,
            endAt,
          );
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
          data: this.sessionSlotIndices(dto.slotStart, dto.slotEnd).map(
            (i) => ({
              teacher_id: user.id,
              slot_date: new Date(dto.date),
              slot_index: i,
              status: 'booked',
              booking_id: b.id,
            }),
          ),
        });
        return b;
      });
      // 역상담 제안 → 학생 알림
      await this.notify.notify(dto.studentId, 'reverse_proposed', {
        bookingId: booking.id,
        teacherId: user.id,
        date: dto.date,
      });
      return this.toBookingDto(booking);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('이미 예약된 시간입니다.');
      }
      throw e;
    }
  }

  /** PATCH /bookings/{id}/reverse-respond — 학생이 역상담 수락(크레딧 차감·confirmed)/거절(슬롯 해제·rejected). */
  async respondReverse(
    id: string,
    action: 'accept' | 'reject',
    user: AuthUser,
  ) {
    const b = await this.prisma.booking.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('예약을 찾을 수 없습니다.');
    if (b.direction !== 'reverse')
      throw new BadRequestException('역상담 제안이 아닙니다.');
    if (user.role !== AccountRole.STUDENT || b.student_id !== user.id) {
      throw new ForbiddenException('제안 대상 학생만 응답할 수 있습니다.');
    }
    if (b.status !== BookingStatus.NEW) {
      throw new BadRequestException(`응답할 수 없는 상태입니다: ${b.status}`);
    }

    if (action === 'reject') {
      await this.prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id },
          data: { status: BookingStatus.REJECTED },
        });
        await tx.time_slot.deleteMany({ where: { booking_id: id } });
      });
      // 역상담 거절 → 제안한 선생님 알림
      await this.notify.notify(b.teacher_id, 'reverse_rejected', {
        bookingId: id,
        studentId: user.id,
      });
      return { id, status: BookingStatus.REJECTED };
    }

    // accept → 크레딧 차감(§5-3) + confirmed
    const credits = b.charged_credits ?? 0;
    try {
      await this.prisma.$transaction(async (tx) => {
        const outcome = await this.credit.consumeWithin(
          tx,
          b.student_id,
          credits,
          {
            refType: 'booking',
            refId: id,
            description: '역상담 수락 크레딧 차감',
          },
        );
        if (!outcome.ok) throw new ShortfallError(outcome.shortfall);
        await tx.booking.update({
          where: { id },
          data: { status: BookingStatus.CONFIRMED },
        });
      });
      await this.issueMeetingUrlIfZoom(id); // §9·§10 zoom 입장 URL
      // 역상담 수락 → 제안한 선생님 알림
      await this.notify.notify(b.teacher_id, 'reverse_accepted', {
        bookingId: id,
        studentId: user.id,
      });
      return { id, status: BookingStatus.CONFIRMED, chargedCredits: credits };
    } catch (e) {
      if (e instanceof ShortfallError) {
        await this.credit.createPaymentRequest(b.student_id, e.shortfall, {
          refType: 'booking',
          refId: id,
        });
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
    return this.transition(id, BookingStatus.CONFIRMED, user, [
      AccountRole.TEACHER,
    ]);
  }
  confirm(id: string, user: AuthUser) {
    return this.transition(id, BookingStatus.CONFIRMED, user, [
      AccountRole.TEACHER,
      AccountRole.ADMIN,
    ]);
  }
  reject(id: string, user: AuthUser) {
    return this.transition(id, BookingStatus.REJECTED, user, [
      AccountRole.TEACHER,
    ]);
  }
  async complete(id: string, user: AuthUser) {
    // §5-5: 완료(done)는 상담 기록 final 저장이 선행되어야 한다.
    const note = await this.prisma.consultation_note.findUnique({
      where: { booking_id: id },
    });
    if (!note || note.save_state !== 'final') {
      throw new BadRequestException(
        '완료 전에 상담 기록을 final 로 저장해야 합니다.',
      );
    }
    return this.transition(id, BookingStatus.DONE, user, [AccountRole.TEACHER]);
  }
  noshow(id: string, user: AuthUser) {
    return this.transition(id, BookingStatus.NOSHOW, user, [
      AccountRole.TEACHER,
    ]);
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
    if (
      user.role === AccountRole.ADMIN &&
      b.center_id &&
      user.centerId &&
      b.center_id !== user.centerId
    )
      throw new ForbiddenException('다른 센터의 예약은 처리할 수 없습니다.');

    const from = b.status;
    if (!canTransition(from, to)) {
      throw new BadRequestException(`허용되지 않는 상태 전이: ${from} → ${to}`);
    }

    // 역상담 제안(reverse + NEW)은 크레딧이 아직 소비되지 않았으므로 환원 금지(무료 발급 방지).
    const consumed = !(b.direction === 'reverse' && from === BookingStatus.NEW);
    const refund =
      shouldRefundOnTransition(from, to) &&
      (b.charged_credits ?? 0) > 0 &&
      consumed;
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
    // 상태 변화 → 학생 알림(승인/거절/노쇼). 학생 본인 취소는 알림 생략.
    if (to === BookingStatus.CONFIRMED)
      await this.notify.notify(b.student_id, 'booking_confirmed', {
        bookingId: id,
      });
    else if (to === BookingStatus.REJECTED)
      await this.notify.notify(b.student_id, 'booking_rejected', {
        bookingId: id,
      });
    else if (to === BookingStatus.NOSHOW)
      await this.notify.notify(b.student_id, 'booking_noshow', {
        bookingId: id,
      });
    return { id, status: to, refunded: refund ? b.charged_credits : 0 };
  }

  /** §5-7 가중 제한: 노쇼·과다거절 임계 초과 학생은 신규 예약 차단. */
  private async assertNotPenaltyRestricted(studentId: string) {
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: studentId },
    });
    if (!sp?.center_id) return;
    const pp = await this.prisma.penalty_policy.findUnique({
      where: { center_id: sp.center_id },
    });
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
        rankingWeightDown:
          pp.ranking_weight_down == null
            ? null
            : Number(pp.ranking_weight_down),
      },
      {
        restrictMinutes: pp.restrict_minutes,
        penaltySinceMs: sp.penalty_since ? sp.penalty_since.getTime() : null,
        nowMs: Date.now(),
      },
    );
    if (result.restricted) {
      throw new ForbiddenException(
        `가중 제한으로 신규 예약이 일시 제한되었습니다(${result.reasons.join(',')}).`,
      );
    }
  }

  private sessionSlotIndices(start: number, end: number): number[] {
    return Array.from({ length: end - start }, (_, k) => start + k);
  }

  /**
   * (teacher, date) 단위 advisory xact lock — §5-1 휴게버퍼 TOCTOU 방지.
   * 락 확보 후 버퍼 재검증을 직렬화해 동시 인접 예약을 차단한다(트랜잭션 종료 시 자동 해제).
   */
  private async lockTeacherDate(
    tx: Prisma.TransactionClient,
    teacherId: string,
    date: string,
  ) {
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
    const zp = await tx.zoom_policy.findUnique({
      where: { center_id: centerId },
    });
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
      throw new ConflictException(
        `동시 진행 가능한 줌 상담 수(${limit})를 초과했습니다.`,
      );
    }
  }

  /**
   * zoom 예약 확정 시 입장 URL 발급(§9·§10). 트랜잭션 외부에서 호출(외부 호출이 DB tx 를 늘리지 않도록).
   * 이미 발급됐으면(idempotent) 생략. 발급 실패는 확정을 막지 않고 로그만(추후 재발급 가능).
   */
  private async issueMeetingUrlIfZoom(bookingId: string) {
    const b = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!b || b.mode !== ConsultMode.ZOOM || b.meeting_url) return;
    try {
      const { joinUrl } = await this.zoom.issueJoinUrl({
        bookingId: b.id,
        startAt: b.start_at,
        endAt: b.end_at,
      });
      await this.prisma.booking.update({
        where: { id: b.id },
        data: { meeting_url: joinUrl },
      });
    } catch (e) {
      this.logger.warn(
        `입장 URL 발급 실패(booking=${bookingId}): ${(e as Error).message}`,
      );
    }
  }

  /**
   * 오프라인 상담실 배정(§5 상담실). 센터 내 status=available 방 중 요청 시간대와 겹치는
   * 진행 예정(new/confirmed) 예약이 없는 첫 방을 선정. room:센터:날짜 advisory 락으로
   * 교차-선생님 동시 배정을 직렬화(중복 점유 방지, §7). 가용 방이 없으면 409.
   */
  private async assignRoom(
    tx: Prisma.TransactionClient,
    centerId: string | null,
    date: string,
    startAt: Date,
    endAt: Date,
  ): Promise<string> {
    if (!centerId)
      throw new ConflictException(
        '센터 정보가 없어 상담실을 배정할 수 없습니다.',
      );
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`room:${centerId}:${date}`}))`;
    const rooms = await tx.room.findMany({
      where: { center_id: centerId, status: 'available' },
    });
    if (rooms.length === 0)
      throw new ConflictException('등록된 상담실이 없습니다(관리자에게 문의).');
    for (const room of rooms) {
      const conflict = await tx.booking.count({
        where: {
          room_id: room.id,
          status: { in: [BookingStatus.NEW, BookingStatus.CONFIRMED] },
          start_at: { lt: endAt },
          end_at: { gt: startAt },
        },
      });
      if (conflict === 0) return room.id;
    }
    throw new ConflictException('해당 시간에 이용 가능한 상담실이 없습니다.');
  }

  private async requireTeacher(teacherId: string) {
    const t = await this.prisma.teacher_profile.findUnique({
      where: { account_id: teacherId },
    });
    if (!t) throw new NotFoundException('선생님을 찾을 수 없습니다.');
    return t;
  }

  /**
   * 학생 등록(프로필) 확인. 회원가입+승인만 된(프로필 미생성) 계정의 예약 시
   * FK 위반으로 500 나는 것을 방지하고, 역방향(역상담)과 동일하게 명확한 404 로 응답.
   */
  private async requireStudent(studentId: string) {
    const s = await this.prisma.student_profile.findUnique({
      where: { account_id: studentId },
    });
    if (!s)
      throw new NotFoundException(
        '학생 등록(프로필)이 완료되지 않았습니다. 회원등록 후 이용하세요.',
      );
    return s;
  }

  /**
   * 역상담 대상 학생 목록(선생님용). 같은 센터 학생 중 자격 3종을 분류해 반환.
   *  - first: 첫상담 필요(완료 상담 0건)
   *  - admin: 관리자 지정(reverse_admin)
   *  - self : 학생 신청(reverse_self)
   * types 가 비면 제외. 중복(예: ['admin','self'])이면 화면에서 조합 배지로 표시.
   */
  async listReverseEligible(user: AuthUser) {
    if (user.role !== AccountRole.TEACHER)
      throw new ForbiddenException('선생님만 조회할 수 있습니다.');
    const teacher = await this.requireTeacher(user.id);
    const rows = await this.prisma.student_profile.findMany({
      where: {
        ...(teacher.center_id ? { center_id: teacher.center_id } : {}),
        OR: [
          { done_count: 0 },
          { done_count: null },
          { reverse_admin: true },
          { reverse_self: true },
        ],
      },
      include: { account: { select: { name: true, login_id: true } } },
      orderBy: { last_consult_at: 'asc' },
    });
    const data = rows
      .map((s) => {
        const types: string[] = [];
        if ((s.done_count ?? 0) === 0) types.push('first');
        if (s.reverse_admin) types.push('admin');
        if (s.reverse_self) types.push('self');
        return {
          studentId: s.account_id,
          name: s.account?.name ?? '학생',
          loginId: s.account?.login_id ?? null,
          doneCount: s.done_count ?? 0,
          lastConsultAt: s.last_consult_at?.toISOString() ?? null,
          types,
        };
      })
      .filter((x) => x.types.length > 0);
    return { data };
  }

  /** 관리자 역상담 대상 관리 목록 — 센터 학생 + 현재 지정/신청 플래그. */
  async adminListReverseStudents(user: AuthUser) {
    if (user.role !== AccountRole.ADMIN && user.role !== AccountRole.HR)
      throw new ForbiddenException('관리자만 조회할 수 있습니다.');
    const rows = await this.prisma.student_profile.findMany({
      where: user.centerId ? { center_id: user.centerId } : {},
      include: { account: { select: { name: true, login_id: true } } },
      orderBy: { last_consult_at: 'asc' },
    });
    return {
      data: rows.map((s) => ({
        studentId: s.account_id,
        name: s.account?.name ?? '학생',
        loginId: s.account?.login_id ?? null,
        doneCount: s.done_count ?? 0,
        reverseAdmin: s.reverse_admin,
        reverseSelf: s.reverse_self,
      })),
    };
  }

  /** 관리자: 학생을 역상담 대상으로 지정/해제(reverse_admin). */
  async adminSetReverse(studentId: string, value: boolean, user: AuthUser) {
    if (user.role !== AccountRole.ADMIN && user.role !== AccountRole.HR)
      throw new ForbiddenException('관리자만 변경할 수 있습니다.');
    const s = await this.requireStudent(studentId);
    if (user.centerId && s.center_id && s.center_id !== user.centerId)
      throw new ForbiddenException('다른 센터의 학생은 변경할 수 없습니다.');
    await this.prisma.student_profile.update({
      where: { account_id: studentId },
      data: { reverse_admin: value },
    });
    return { studentId, reverseAdmin: value };
  }

  /** 학생: 본인 역상담 받기 신청 현황(reverse_self). */
  async studentGetReverse(user: AuthUser) {
    if (user.role !== AccountRole.STUDENT)
      throw new ForbiddenException('학생만 조회할 수 있습니다.');
    const s = await this.requireStudent(user.id);
    return { reverseSelf: s.reverse_self };
  }

  /** 학생: 본인 역상담 받기 신청/취소(reverse_self). */
  async studentSetReverse(value: boolean, user: AuthUser) {
    if (user.role !== AccountRole.STUDENT)
      throw new ForbiddenException('학생만 신청할 수 있습니다.');
    await this.requireStudent(user.id);
    await this.prisma.student_profile.update({
      where: { account_id: user.id },
      data: { reverse_self: value },
    });
    return { studentId: user.id, reverseSelf: value };
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
    room_id?: string | null;
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
      roomId: b.room_id ?? null,
    };
  }
}
