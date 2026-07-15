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
import { permAtLeast } from '../../config/perm';
import { resolveStudentType, STUDENT_TYPE_LABEL, type StudentType } from '../../common/student-type';
import { DEFAULT_CONSULT_DURATION, CONSULT_TYPES, isFullTime, DEFAULT_QUESTION_DURATION, QUESTION_TIERS, difficultyTier } from '../../common/consult-assignment';
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
  RescheduleDto,
  ReverseProposeDto,
} from './dto/booking.dto';
import {
  canTransition,
  shouldRefundOnTransition,
} from './domain/state-machine';
import { canProposeReverse } from './domain/reverse';

/** 예약 불가 사유 → 학생 안내 문구(구체). null 은 호출측에서 처리(가능). */
function slotReasonMessage(reason: 'booked' | 'blocked' | 'rest' | 'off' | 'range' | null): string {
  switch (reason) {
    case 'booked': return '이미 예약된 시간이에요. 다른 시간을 선택해 주세요.';
    case 'rest': return '앞뒤 상담 사이 휴게시간(10분)이라 예약할 수 없어요. 10분 이상 떨어진 시간을 골라 주세요.';
    case 'blocked': return '관리자가 차단한 시간이라 예약할 수 없어요.';
    case 'off': return '선생님 근무시간(또는 내 체류시간)이 아니에요. 다른 날짜·시간을 선택해 주세요.';
    case 'range': return '상담 시간 범위가 올바르지 않아요.';
    default: return '선택한 시간은 예약할 수 없어요.';
  }
}

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

  // ── 역상담 정책(전사) — 본사: 오프라인 한정(offlineOnly), 마스터: 크레딧 미소모(free) ──
  private static readonly REVERSE_KEY = 'reverse_policy';
  private static readonly REVERSE_DEFAULT = { offlineOnly: false, free: false };

  async getReversePolicy(): Promise<{ offlineOnly: boolean; free: boolean }> {
    const row = await this.prisma.system_setting.findUnique({ where: { key: BookingService.REVERSE_KEY } });
    return { ...BookingService.REVERSE_DEFAULT, ...((row?.value as object) ?? {}) };
  }

  /** 정책 변경: offlineOnly=본사 관리자(isHq), free=마스터(L1). */
  async setReversePolicy(actor: AuthUser, dto: { offlineOnly?: boolean; free?: boolean }) {
    const isHq = actor.role === AccountRole.ADMIN && !actor.centerId;
    if (dto.offlineOnly !== undefined && !isHq) {
      throw new ForbiddenException('역상담 오프라인 한정 정책은 본사 관리자만 변경할 수 있습니다.');
    }
    if (dto.free !== undefined && !(isHq && permAtLeast(actor.permLevel, 'L1'))) {
      throw new ForbiddenException('역상담 크레딧 정책은 본사 마스터관리자(L1)만 변경할 수 있습니다.');
    }
    const next = { ...(await this.getReversePolicy()), ...dto };
    await this.prisma.system_setting.upsert({
      where: { key: BookingService.REVERSE_KEY },
      create: { key: BookingService.REVERSE_KEY, value: next, updated_by: actor.id },
      update: { value: next, updated_by: actor.id, updated_at: new Date() },
    });
    return next;
  }

  // ── 외부학생 정책(전사) — 본사(isHq): 온라인 한정(onlineOnly)·상담 제한(boardOnly);
  //    마스터(L1): 요금 할증(surchargePct)·주간 크레딧 부여(weeklyGrant). 벤치마크: 회원 유형 차등. ──
  private static readonly EXTERNAL_KEY = 'external_student_policy';
  private static readonly EXTERNAL_DEFAULT = {
    // 오프라인 개방은 2단계: 노출(offlineDiscovery) → 예약(onlineOnly=false).
    offlineDiscovery: false, // 검색·추천·매칭에 오프라인 선생님 노출 여부(false=숨김)
    onlineOnly: true, // 외부생 오프라인 예약 차단(상담실 배정 불가). false 면 오프라인 예약 허용
    surchargePct: 20, // 외부생 요금 할증 %
    weeklyGrant: false, // 외부생은 주간 크레딧 부여 제외
    boardOnly: false, // true 면 외부생은 상담 예약 불가·게시판 질문만
  };

  async getExternalPolicy(): Promise<{ offlineDiscovery: boolean; onlineOnly: boolean; surchargePct: number; weeklyGrant: boolean; boardOnly: boolean }> {
    const row = await this.prisma.system_setting.findUnique({ where: { key: BookingService.EXTERNAL_KEY } });
    return { ...BookingService.EXTERNAL_DEFAULT, ...((row?.value as object) ?? {}) };
  }

  /**
   * 학생 본인 컨텍스트 — 유형(학원생/외부)과 외부학생일 때 적용되는 정책을 학생 화면에 안내.
   * 외부학생이면 온라인 전용·요금 할증·주간 크레딧 부여 여부를 배너로 노출(enrolled 는 external=null).
   */
  async getStudentContext(user: AuthUser) {
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: user.id },
      select: { type_code: true, center_id: true },
    });
    const type: StudentType = sp ? resolveStudentType(sp) : 'enrolled';
    const pol = await this.getExternalPolicy();
    return {
      type,
      label: STUDENT_TYPE_LABEL[type],
      external:
        type === 'external'
          ? { onlineOnly: pol.onlineOnly, surchargePct: pol.surchargePct, weeklyGrant: pol.weeklyGrant, boardOnly: pol.boardOnly }
          : null,
    };
  }

  /**
   * 정책 변경: 접근(offlineDiscovery·onlineOnly·boardOnly)=본사(isHq),
   * 요금·크레딧(surchargePct·weeklyGrant)=마스터(L1).
   * 2단계 불변식: 오프라인 예약을 열면(onlineOnly=false) 노출도 켜지고(offlineDiscovery=true),
   * 노출을 끄면(offlineDiscovery=false) 예약도 잠긴다(onlineOnly=true). → 3개 유효 상태만 존재.
   */
  async setExternalPolicy(actor: AuthUser, dto: { offlineDiscovery?: boolean; onlineOnly?: boolean; surchargePct?: number; weeklyGrant?: boolean; boardOnly?: boolean }) {
    const isHq = actor.role === AccountRole.ADMIN && !actor.centerId;
    const isMaster = isHq && permAtLeast(actor.permLevel, 'L1');
    if ((dto.offlineDiscovery !== undefined || dto.onlineOnly !== undefined || dto.boardOnly !== undefined) && !isHq) {
      throw new ForbiddenException('외부학생 접근 정책(노출·온라인 한정·상담 제한)은 본사 관리자만 변경할 수 있습니다.');
    }
    if ((dto.surchargePct !== undefined || dto.weeklyGrant !== undefined) && !isMaster) {
      throw new ForbiddenException('외부학생 요금·크레딧 정책은 본사 마스터관리자(L1)만 변경할 수 있습니다.');
    }
    if (dto.surchargePct !== undefined && (dto.surchargePct < 0 || dto.surchargePct > 300)) {
      throw new BadRequestException('할증률은 0~300% 범위여야 합니다.');
    }
    const next = { ...(await this.getExternalPolicy()), ...dto };
    // 2단계 불변식 강제(노출↔예약 정합성) — dto 가 명시한 필드를 우선 반영
    if (dto.offlineDiscovery === false) next.onlineOnly = true; // 노출 끄면 예약 잠금(노출이 상위 단계)
    if (dto.onlineOnly === false) next.offlineDiscovery = true; // 예약 열면 노출도 켬
    if (!next.offlineDiscovery) next.onlineOnly = true; // 방어: 노출 off 상태에서 예약만 열린 모순 차단
    await this.prisma.system_setting.upsert({
      where: { key: BookingService.EXTERNAL_KEY },
      create: { key: BookingService.EXTERNAL_KEY, value: next, updated_by: actor.id },
      update: { value: next, updated_by: actor.id, updated_at: new Date() },
    });
    return next;
  }

  // ── 상담 종류별 기본 상담시간(분) — 본사 관리자(isHq) 조정. 강제배정·자동매칭 슬롯 길이 기준. ──
  private static readonly DURATION_KEY = 'consult_duration_policy';

  async getDurationPolicy(): Promise<Record<string, number>> {
    const row = await this.prisma.system_setting.findUnique({ where: { key: BookingService.DURATION_KEY } });
    return { ...DEFAULT_CONSULT_DURATION, ...((row?.value as Record<string, number>) ?? {}) };
  }

  /** 특정 상담 종류의 기본 시간(분). */
  async defaultMinutes(consultType: string): Promise<number> {
    const pol = await this.getDurationPolicy();
    return pol[consultType] ?? DEFAULT_CONSULT_DURATION[consultType] ?? 30;
  }

  /** 정책 변경: 본사 관리자(isHq)만. 값은 10~240분, 10분 슬롯 배수. */
  async setDurationPolicy(actor: AuthUser, dto: Record<string, number>) {
    const isHq = actor.role === AccountRole.ADMIN && !actor.centerId;
    if (!isHq) throw new ForbiddenException('상담 종류별 기본시간은 본사 관리자만 변경할 수 있습니다.');
    for (const [k, v] of Object.entries(dto)) {
      if (!CONSULT_TYPES.includes(k as never)) throw new BadRequestException(`알 수 없는 상담 종류: ${k}`);
      if (typeof v !== 'number' || v < 10 || v > 240 || v % SLOT_GRANULARITY_MINUTES !== 0) {
        throw new BadRequestException(`${k} 기본시간은 10~240분, ${SLOT_GRANULARITY_MINUTES}분 배수여야 합니다.`);
      }
    }
    const next = { ...(await this.getDurationPolicy()), ...dto };
    await this.prisma.system_setting.upsert({
      where: { key: BookingService.DURATION_KEY },
      create: { key: BookingService.DURATION_KEY, value: next, updated_by: actor.id },
      update: { value: next, updated_by: actor.id, updated_at: new Date() },
    });
    return next;
  }

  // ── 질문 답변블록 난이도별 길이(분) — 본사 관리자 조정 ──
  private static readonly QUESTION_DURATION_KEY = 'question_duration_policy';

  async getQuestionDurationPolicy(): Promise<Record<string, number>> {
    const row = await this.prisma.system_setting.findUnique({ where: { key: BookingService.QUESTION_DURATION_KEY } });
    return { ...DEFAULT_QUESTION_DURATION, ...((row?.value as Record<string, number>) ?? {}) };
  }

  /** 난이도 문자열 → 답변블록 분. 티어 매핑 후 정책값. */
  async questionMinutes(difficulty?: string | null): Promise<number> {
    const pol = await this.getQuestionDurationPolicy();
    const tier = difficultyTier(difficulty);
    return pol[tier] ?? DEFAULT_QUESTION_DURATION[tier] ?? 15;
  }

  async setQuestionDurationPolicy(actor: AuthUser, dto: Record<string, number>) {
    const isHq = actor.role === AccountRole.ADMIN && !actor.centerId;
    if (!isHq) throw new ForbiddenException('질문 답변블록 길이는 본사 관리자만 변경할 수 있습니다.');
    for (const [k, v] of Object.entries(dto)) {
      if (!QUESTION_TIERS.includes(k as never)) throw new BadRequestException(`알 수 없는 난이도 티어: ${k}`);
      if (typeof v !== 'number' || v < 10 || v > 120 || v % SLOT_GRANULARITY_MINUTES !== 0) {
        throw new BadRequestException(`${k} 길이는 10~120분, ${SLOT_GRANULARITY_MINUTES}분 배수여야 합니다.`);
      }
    }
    const next = { ...(await this.getQuestionDurationPolicy()), ...dto };
    await this.prisma.system_setting.upsert({
      where: { key: BookingService.QUESTION_DURATION_KEY },
      create: { key: BookingService.QUESTION_DURATION_KEY, value: next, updated_by: actor.id },
      update: { value: next, updated_by: actor.id, updated_at: new Date() },
    });
    return next;
  }

  /**
   * §5-8 기능 열기/닫기(FeatureAvailability) + 카테고리×방식(CategoryModePolicy) 게이트.
   * 닫힌 방식/카테고리이거나 허용되지 않은 방식이면 예약 차단.
   */
  private async assertConsultAllowed(
    centerId: string | null,
    consultType: ConsultType,
    mode: ConsultMode,
    studentType?: StudentType,
  ) {
    const modeFeature = await this.adminPolicy.resolveFeature(
      centerId,
      'mode',
      mode,
      studentType,
    );
    if (!modeFeature.enabled)
      throw new ForbiddenException(`현재 ${mode} 방식은 닫혀 있습니다.`);
    const catFeature = await this.adminPolicy.resolveFeature(
      centerId,
      'category',
      consultType,
      studentType,
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
    const studentProfile = studentId ? await this.requireStudent(studentId) : null; // 미등록 승인계정 견적 시 500 방지
    const studentType: StudentType = studentProfile ? resolveStudentType(studentProfile) : 'enrolled';
    const extPol = await this.getExternalPolicy();
    const extBlocked = studentType === 'external' && extPol.boardOnly;
    const extOfflineBlocked = studentType === 'external' && extPol.onlineOnly && dto.mode === ConsultMode.OFFLINE;

    const slotReason = await this.availability.bookableReason(
      dto.teacherId,
      dto.date,
      dto.slotStart * SLOT_GRANULARITY_MINUTES,
      dto.slotEnd * SLOT_GRANULARITY_MINUTES,
      studentId,
    );
    const slotOk = slotReason === null;
    // 방식·상담유형 열림 여부까지 견적에서 미리 확인(제출 후 403 대신 사전 안내).
    const modeFeature = await this.adminPolicy.resolveFeature(teacher.center_id, 'mode', dto.mode, studentType);
    const catFeature = dto.consultType
      ? await this.adminPolicy.resolveFeature(teacher.center_id, 'category', dto.consultType, studentType)
      : { enabled: true };
    const q = await this.pricing.quoteSession(
      dto.mode,
      minutes,
      teacher.grade,
      teacher.center_id,
      dto.consultType,
      studentType === 'external' ? extPol.surchargePct : 0,
    );
    const working = !teacher.work_status || teacher.work_status === 'on';
    const valid = slotOk && modeFeature.enabled && catFeature.enabled && working && !extBlocked && !extOfflineBlocked;
    const message = extBlocked
      ? '외부학생은 상담 예약이 제한되어 있어요. 게시판 질문을 이용해 주세요.'
      : extOfflineBlocked
        ? '외부학생은 온라인 상담만 가능해요(오프라인 대면 불가).'
        : !working
          ? (teacher.work_status === 'rest' ? '선생님이 휴게 중이에요. 잠시 후 다시 시도해 주세요.' : '선생님이 오늘 상담을 마감했어요.')
          : !slotOk
            ? slotReasonMessage(slotReason)
            : !modeFeature.enabled
              ? `현재 ${dto.mode} 방식은 닫혀 있어요. 다른 방식을 선택하세요.`
              : !catFeature.enabled
                ? `현재 ${dto.consultType} 상담은 닫혀 있어요.`
                : '예약 가능';
    return { minutes, credits: q.credits, valid, message, studentType, externalSurcharge: q.externalSurcharge };
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

    const student = await this.requireStudent(studentId); // 회원등록(프로필) 선행 — 미등록 승인계정 500 방지
    const studentType: StudentType = resolveStudentType(student);
    // 외부학생 접근 게이팅(§외부생 정책, 본사/마스터 설정)
    if (studentType === 'external') {
      const extPol = await this.getExternalPolicy();
      if (extPol.boardOnly) {
        throw new ForbiddenException('외부학생은 상담 예약이 제한되어 있어요. 게시판 질문을 이용해 주세요.');
      }
      if (extPol.onlineOnly && dto.mode === ConsultMode.OFFLINE) {
        throw new ForbiddenException('외부학생은 온라인 상담만 가능해요(오프라인 대면 불가).');
      }
    }
    await this.assertNotPenaltyRestricted(studentId); // §5-7 가중 제한
    const blocked = await this.blocks.blockedTeacherIds(studentId);
    if (blocked.includes(dto.teacherId)) {
      throw new ForbiddenException('차단한 선생님에게는 예약할 수 없습니다.');
    }
    const teacher = await this.requireTeacher(dto.teacherId);
    // 근무 상태 게이팅: 휴게중/퇴근인 선생님에겐 신규 상담 신청 차단(학생 발신 한정).
    if (user.role === AccountRole.STUDENT && teacher.work_status && teacher.work_status !== 'on') {
      throw new ForbiddenException(teacher.work_status === 'rest' ? '선생님이 휴게 중이라 지금은 신청할 수 없어요.' : '선생님이 오늘 상담을 마감했어요.');
    }
    await this.assertConsultAllowed(
      teacher.center_id,
      dto.consultType,
      dto.mode,
      studentType,
    ); // §5-8 게이트 + 외부생 유형 강제
    const startMin = dto.slotStart * SLOT_GRANULARITY_MINUTES;
    const endMin = dto.slotEnd * SLOT_GRANULARITY_MINUTES;

    const reason = await this.availability.bookableReason(
      dto.teacherId,
      dto.date,
      startMin,
      endMin,
      studentId,
    );
    if (reason !== null) {
      throw new ConflictException(slotReasonMessage(reason));
    }

    const q = await this.pricing.quoteSession(
      dto.mode,
      minutes,
      teacher.grade,
      teacher.center_id,
      dto.consultType,
      studentType === 'external' ? (await this.getExternalPolicy()).surchargePct : 0,
    );
    const credits = q.credits;
    const startAt = utcFromKst(dto.date, startMin);
    const endAt = utcFromKst(dto.date, endMin);
    const autoConfirm = isFullTime(teacher.employment_type); // 전임 강제 배정(자동 확정)

    try {
      const booking = await this.bookingTx(async (tx) => {
        await this.lockTeacherDate(tx, dto.teacherId, dto.date);
        // 락 확보 후 재검증(§5-1 TOCTOU 방지) — 직렬화되어 권위 있는 판정
        const stillReason = await this.availability.bookableReason(
          dto.teacherId,
          dto.date,
          startMin,
          endMin,
          studentId,
        );
        if (stillReason !== null) {
          throw new ConflictException(slotReasonMessage(stillReason));
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
            // 전임(풀타임)은 근무시간 강제 배정 — 수락단계 생략하고 학생이 고른 시간에 자동 확정
            status: autoConfirm ? BookingStatus.CONFIRMED : BookingStatus.NEW,
            room_id: roomId,
            charged_credits: credits,
            origin: autoConfirm ? '전임자동' : '직접',
            content: dto.content ?? null,
            attachments: (dto.attachments ?? []) as unknown as Prisma.InputJsonValue,
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
      if (autoConfirm) {
        // 전임 자동 확정: 줌 입장 URL 발급 + 학생·선생님 알림(수락 절차 없음)
        await this.issueMeetingUrlIfZoom(booking.id);
        await this.notify.notify(studentId, 'booking_confirmed', { bookingId: booking.id });
        await this.notify.notify(dto.teacherId, 'booking_assigned', {
          bookingId: booking.id, studentId, date: dto.date,
        });
      } else {
        // 상담 신청 들어옴 → 선생님 알림
        await this.notify.notify(dto.teacherId, 'booking_requested', {
          bookingId: booking.id, studentId, date: dto.date,
        });
      }
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

  /**
   * 내부 강제 배정용 자동확정 예약 생성(전임 배치 — 자동배정 대기·질문·역상담).
   * 유효 슬롯이 아니거나 크레딧 부족이면 배정하지 않고 사유 반환(예외 대신).
   */
  async createAssigned(p: {
    studentId: string;
    teacherId: string;
    centerId: string | null;
    teacherGrade: TeacherGrade;
    consultType: ConsultType;
    subType?: string | null;
    mode: ConsultMode;
    dateStr: string;
    slotStart: number;
    slotEnd: number;
    charge: 'session' | 'free'; // free = 질문 답변블록·무료 역상담(이미 과금됨/무료 정책)
    origin: string;
    direction?: 'student' | 'reverse';
    content?: string | null;
  }): Promise<{ ok: boolean; bookingId?: string; reason?: string }> {
    const startMin = p.slotStart * SLOT_GRANULARITY_MINUTES;
    const endMin = p.slotEnd * SLOT_GRANULARITY_MINUTES;
    const minutes = endMin - startMin;
    if (minutes <= 0) return { ok: false, reason: 'invalid_slot' };
    const startAt = utcFromKst(p.dateStr, startMin);
    const endAt = utcFromKst(p.dateStr, endMin);
    // 외부학생이면 세션 과금에 할증 반영(외부생 정책과 일관)
    let extSurcharge = 0;
    if (p.charge === 'session') {
      const sp = await this.prisma.student_profile.findUnique({ where: { account_id: p.studentId }, select: { type_code: true, center_id: true } });
      if (sp && resolveStudentType(sp) === 'external') extSurcharge = (await this.getExternalPolicy()).surchargePct;
    }
    const credits = p.charge === 'free'
      ? 0
      : (await this.pricing.quoteSession(p.mode, minutes, p.teacherGrade, p.centerId, p.consultType, extSurcharge)).credits;
    try {
      const booking = await this.bookingTx(async (tx) => {
        await this.lockTeacherDate(tx, p.teacherId, p.dateStr);
        const reason = await this.availability.bookableReason(p.teacherId, p.dateStr, startMin, endMin, p.studentId);
        if (reason !== null) throw new ConflictException(slotReasonMessage(reason));
        if (p.mode === ConsultMode.ZOOM) await this.assertZoomCapacity(tx, p.centerId, p.dateStr, startAt, endAt);
        let roomId: string | null = null;
        if (p.mode === ConsultMode.OFFLINE) roomId = await this.assignRoom(tx, p.centerId, p.dateStr, startAt, endAt);
        const b = await tx.booking.create({
          data: {
            student_id: p.studentId, teacher_id: p.teacherId, center_id: p.centerId,
            consult_type: consultTypeToPrisma(p.consultType), sub_type: p.subType ?? null,
            mode: p.mode, direction: p.direction ?? 'student',
            start_at: startAt, end_at: endAt, status: BookingStatus.CONFIRMED,
            room_id: roomId, charged_credits: credits, origin: p.origin, content: p.content ?? null,
          },
        });
        if (credits > 0) {
          const outcome = await this.credit.consumeWithin(tx, p.studentId, credits, {
            refType: 'booking', refId: b.id, description: '전임 자동 배정 크레딧 차감',
          });
          if (!outcome.ok) throw new ShortfallError(outcome.shortfall);
        }
        await tx.time_slot.createMany({
          data: this.sessionSlotIndices(p.slotStart, p.slotEnd).map((i) => ({
            teacher_id: p.teacherId, slot_date: new Date(p.dateStr), slot_index: i, status: 'booked', booking_id: b.id,
          })),
        });
        return b;
      });
      await this.issueMeetingUrlIfZoom(booking.id);
      await this.notify.notify(p.studentId, 'booking_confirmed', { bookingId: booking.id });
      await this.notify.notify(p.teacherId, 'booking_assigned', { bookingId: booking.id, studentId: p.studentId, date: p.dateStr });
      return { ok: true, bookingId: booking.id };
    } catch (e) {
      if (e instanceof ShortfallError) return { ok: false, reason: 'shortfall' };
      if (e instanceof ConflictException) return { ok: false, reason: 'slot_taken' };
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: false, reason: 'slot_taken' };
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
    // 학생 뷰: 완료 상담의 후기 작성 여부를 표기(중복 후기 폼 방지·UX).
    let reviewed = new Set<string>();
    if (!asTeacher) {
      const doneIds = rows.filter((b) => b.status === BookingStatus.DONE).map((b) => b.id);
      if (doneIds.length) {
        const revs = await this.prisma.review.findMany({ where: { booking_id: { in: doneIds } }, select: { booking_id: true } });
        reviewed = new Set(revs.map((r) => r.booking_id));
      }
    }
    return rows.map((b) => ({ ...this.toBookingDto(b), reviewed: reviewed.has(b.id) }));
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

    // 역상담 전사 정책: 오프라인 한정(본사) → 오프라인 외 방식 차단
    const revPolicy = await this.getReversePolicy();
    if (revPolicy.offlineOnly && dto.mode !== ConsultMode.OFFLINE) {
      throw new ForbiddenException('역상담은 오프라인 대면만 가능합니다(본사 정책).');
    }

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
      const booking = await this.bookingTx(async (tx) => {
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
            charged_credits: revPolicy.free ? 0 : q.credits, // 마스터 정책: 역상담 크레딧 미소모
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
      await this.bookingTx(async (tx) => {
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

    // accept → 크레딧 차감(§5-3) + confirmed. 무료 정책이면 charged_credits=0 → 차감 스킵.
    const credits = b.charged_credits ?? 0;
    try {
      await this.bookingTx(async (tx) => {
        if (credits > 0) {
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
        }
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

  /**
   * 시간 변경(학생) — 예정(new/confirmed) 예약만, 동일 상담 길이로 이동.
   * 기존 슬롯 해제 후 새 창의 예약 가능성 재검증(휴게버퍼·근무·줌한도·상담실),
   * 동일 트랜잭션에서 슬롯 재점유. 길이 동일이라 크레딧 변동 없음. 변경 후 재확정 위해 status=new.
   */
  async reschedule(id: string, dto: RescheduleDto, user: AuthUser) {
    if (user.role !== AccountRole.STUDENT) {
      throw new ForbiddenException('학생만 예약 시간을 변경할 수 있습니다.');
    }
    const b = await this.prisma.booking.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('예약을 찾을 수 없습니다.');
    if (b.student_id !== user.id)
      throw new ForbiddenException('본인 예약이 아닙니다.');
    if (b.direction === 'reverse')
      throw new BadRequestException('역상담 제안은 시간을 변경할 수 없습니다.');
    if (b.status !== BookingStatus.NEW && b.status !== BookingStatus.CONFIRMED)
      throw new BadRequestException('예정된 예약만 시간을 변경할 수 있습니다.');

    const newLen = dto.slotEnd - dto.slotStart;
    if (newLen <= 0)
      throw new BadRequestException('slotEnd 는 slotStart 보다 커야 합니다.');
    if (!b.start_at || !b.end_at)
      throw new BadRequestException('시간 정보가 없는 예약입니다.');
    const oldLen = Math.round(
      (b.end_at.getTime() - b.start_at.getTime()) /
        60000 /
        SLOT_GRANULARITY_MINUTES,
    );
    if (newLen !== oldLen)
      throw new BadRequestException(
        '시간 변경은 기존과 같은 상담 길이로만 가능합니다. 길이를 바꾸려면 취소 후 다시 예약해 주세요.',
      );

    const startMin = dto.slotStart * SLOT_GRANULARITY_MINUTES;
    const endMin = dto.slotEnd * SLOT_GRANULARITY_MINUTES;
    const startAt = utcFromKst(dto.date, startMin);
    const endAt = utcFromKst(dto.date, endMin);
    const mode = b.mode as ConsultMode;

    try {
      const updated = await this.bookingTx(async (tx) => {
        await this.lockTeacherDate(tx, b.teacher_id, dto.date);
        // 기존 슬롯 먼저 해제(트랜잭션 내 가시) → 새 창 점유 시 자기 자신과 P2002 회피.
        await tx.time_slot.deleteMany({ where: { booking_id: id } });
        const rzn = await this.availability.bookableReason(
          b.teacher_id,
          dto.date,
          startMin,
          endMin,
          user.id,
        );
        if (rzn !== null)
          throw new ConflictException(slotReasonMessage(rzn));
        if (mode === ConsultMode.ZOOM)
          await this.assertZoomCapacity(
            tx,
            b.center_id,
            dto.date,
            startAt,
            endAt,
          );
        let roomId = b.room_id;
        if (mode === ConsultMode.OFFLINE)
          roomId = await this.assignRoom(
            tx,
            b.center_id,
            dto.date,
            startAt,
            endAt,
          );
        const upd = await tx.booking.update({
          where: { id },
          data: {
            start_at: startAt,
            end_at: endAt,
            room_id: roomId,
            status: BookingStatus.NEW,
          },
        });
        await tx.time_slot.createMany({
          data: this.sessionSlotIndices(dto.slotStart, dto.slotEnd).map((i) => ({
            teacher_id: b.teacher_id,
            slot_date: new Date(dto.date),
            slot_index: i,
            status: 'booked',
            booking_id: id,
          })),
        });
        return upd;
      });
      await this.notify.notify(b.teacher_id, 'booking_requested', {
        bookingId: id,
        studentId: user.id,
        date: dto.date,
      });
      return this.toBookingDto(updated);
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
    const applied = await this.bookingTx(async (tx) => {
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
   * 예약 트랜잭션 래퍼(§7 동시성). advisory lock 으로 직렬화되므로 고동시성에선 뒤 요청이
   * 대기 → 기본 5s 타임아웃 초과 시 500 이 아니라 우아한 409 로 안내. 타임아웃·대기 상향.
   */
  private bookingTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    // 타임아웃·대기 상향(advisory lock 직렬화 여유). 포화 시 오류는 전역 필터가 503(재시도)로 매핑.
    return this.prisma.$transaction(fn, { timeout: 20_000, maxWait: 20_000 });
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

  /** 단건 조회(관계자만) — 상담 요청 내용·첨부 포함. */
  async getOne(id: string, user: AuthUser) {
    const b = await this.prisma.booking.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('예약을 찾을 수 없습니다.');
    const involved =
      b.teacher_id === user.id ||
      b.student_id === user.id ||
      user.role === AccountRole.ADMIN ||
      user.role === AccountRole.HR;
    if (!involved) throw new ForbiddenException('이 예약에 접근할 권한이 없습니다.');
    // 학생 뷰: 완료 상담 후기 작성 여부(중복 후기 방지·UX)
    let reviewed = false;
    if (user.role === AccountRole.STUDENT && b.status === BookingStatus.DONE) {
      reviewed = !!(await this.prisma.review.findUnique({ where: { booking_id: id }, select: { booking_id: true } }));
    }
    return { ...this.toBookingDto(b), reviewed };
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
    content?: string | null;
    attachments?: unknown;
  }) {
    const atts = Array.isArray(b.attachments)
      ? (b.attachments as { id: string; name: string; type?: string }[])
      : [];
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
      content: b.content ?? null,
      attachments: atts,
    };
  }
}
