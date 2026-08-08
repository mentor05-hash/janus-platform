import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { envInt } from '../../common/quota/usage-quota';
import { AuditService } from '../audit/audit.service';
import {
  FeatureRule,
  resolveFeatureEnabled,
} from '../availability/domain/feature';
import { bumpPricingVersion } from './pricing-cache';
import {
  FREE_EXPOSURE_GUARD,
  FREE_EXPOSURE_KEY,
  FreeExposurePolicy,
  resolveFreeExposure,
} from './domain/free-exposure';
import {
  GRADE_BENEFITS_GUARD,
  GRADE_BENEFITS_KEY,
  GradeBenefit,
  resolveGradeBenefits,
} from './domain/grade-benefits';
import {
  AI_REPORT_PURPOSE,
  AI_USAGE_KEY,
  AI_USAGE_GUARD,
  AiUsagePolicy,
  capacityMessage,
  reconcileCapacity,
  resolveAiUsage,
} from './domain/ai-usage-policy';
import { LLM_DEFAULT_LIMITS, llmDailyLimitEnvKey } from '../llm/llm.limits';
import {
  SetFeatureDto,
  UpdateFreeExposureDto,
  UpdateAiUsageDto,
  UpdateGradeBenefitsDto,
  UpdateLimitsDto,
  UpdatePenaltyDto,
  UpdatePricingDto,
} from './dto/admin-policy.dto';

/**
 * 관리자 정책 편집 (CLAUDE.md §5-2/8/9). 요금·한도·기능토글 단일 소스.
 * 변경은 즉시 반영(PricingService·슬롯 게이트가 같은 테이블을 읽음).
 */
@Injectable()
export class AdminPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** 본사(HQ) 슈퍼관리자 = admin + 센터 미소속(center_id NULL). 전사 정책을 편집·전역 권한. */
  private isHq(actor: AuthUser): boolean {
    return actor.role === 'admin' && !actor.centerId;
  }

  // ── 요금: 전사 기본(center_id NULL, HQ 편집) + 센터 override(center_id=actor.center) ──
  async getPricing(actor: AuthUser) {
    if (this.isHq(actor)) {
      return this.prisma.pricing_policy.findMany({
        where: { center_id: null },
        orderBy: { mode: 'asc' },
      });
    }
    const centerId = this.requireCenter(actor);
    return this.prisma.pricing_policy.findMany({
      where: { OR: [{ center_id: null }, { center_id: centerId }] },
      orderBy: [{ center_id: 'asc' }, { mode: 'asc' }],
    });
  }

  async updatePricing(dto: UpdatePricingDto, actor: AuthUser) {
    // HQ → 전사 기본(center_id NULL), 센터 관리자 → 자기 센터 override
    const targetCenter = this.isHq(actor) ? null : this.requireCenter(actor);
    const existing = await this.prisma.pricing_policy.findFirst({
      where: { center_id: targetCenter, mode: dto.mode },
    });
    // 문항 ≥ 일반 검증(DB CHECK 와 정합)
    const item = dto.boardItemFee ?? existing?.board_item_fee ?? null;
    const general = dto.boardGeneralFee ?? existing?.board_general_fee ?? null;
    if (item != null && general != null && item < general) {
      throw new BadRequestException(
        '게시판 문항 단가는 일반 단가 이상이어야 합니다.',
      );
    }
    const data = {
      enabled: dto.enabled ?? existing?.enabled ?? true,
      per_hour: dto.perHour ?? existing?.per_hour ?? 0,
      surcharge_pct: dto.surchargePct ?? existing?.surcharge_pct ?? 0,
      board_item_fee: item,
      board_general_fee: general,
      offline_occupancy_fee:
        dto.offlineOccupancyFee ?? existing?.offline_occupancy_fee ?? null,
      paid_consulting_fee:
        dto.paidConsultingFee ?? existing?.paid_consulting_fee ?? null,
      updated_by: actor.id,
      updated_at: new Date(),
    };
    const saved = existing
      ? await this.prisma.pricing_policy.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.pricing_policy.create({
          data: {
            center_id: targetCenter,
            mode: dto.mode,
            paid: true,
            ...data,
          },
        });
    await bumpPricingVersion(
      this.cache,
      saved.updated_at?.getTime() ?? Date.now(),
    ); // §10 캐시 무효화
    await this.audit.record(actor, {
      action: 'pricing.update',
      targetType: 'pricing_policy',
      targetId: saved.id,
      summary: `요금 정책 변경(${this.isHq(actor) ? '전사' : '센터'} · ${dto.mode})`,
      meta: {
        mode: dto.mode,
        perHour: data.per_hour,
        surchargePct: data.surcharge_pct,
        enabled: data.enabled,
      },
    });
    return saved;
  }

  // ── 무료 티어 노출 범위(전사, N24) ── 법률 회신에 따라 조정되는 값이라 배포 없이 바꿀 수 있게 둔다.
  async getFreeExposure(): Promise<FreeExposurePolicy> {
    const row = await this.prisma.system_setting.findUnique({
      where: { key: FREE_EXPOSURE_KEY },
    });
    return resolveFreeExposure(row?.value);
  }

  /**
   * 무료 노출 범위 변경 — 전사 정책이라 본사(HQ) 관리자만.
   * 노출을 **늘리는** 방향은 데이터 권리 근거가 필요하므로 안전선을 넘으면 거부한다(B007 회신 전 실수 방지).
   */
  async updateFreeExposure(
    dto: UpdateFreeExposureDto,
    actor: AuthUser,
  ): Promise<FreeExposurePolicy> {
    if (!this.isHq(actor)) {
      throw new ForbiddenException(
        '무료 노출 범위는 본사 관리자만 변경할 수 있습니다.',
      );
    }
    if (
      dto.perBandItems !== undefined &&
      dto.perBandItems > FREE_EXPOSURE_GUARD.maxPerBandItems
    ) {
      throw new BadRequestException(
        `무료 노출은 구간별 최대 ${FREE_EXPOSURE_GUARD.maxPerBandItems}개까지입니다. 더 늘리려면 데이터 권리 검토 결과가 선행되어야 합니다.`,
      );
    }
    const current = await this.getFreeExposure();
    const next: FreeExposurePolicy = { ...current, ...dto };
    await this.prisma.system_setting.upsert({
      where: { key: FREE_EXPOSURE_KEY },
      create: {
        key: FREE_EXPOSURE_KEY,
        value: { ...next },
        updated_by: actor.id,
      },
      update: {
        value: { ...next },
        updated_by: actor.id,
        updated_at: new Date(),
      },
    });
    // 무료 공개 범위는 사업 리스크 항목이라 변경 이력을 반드시 남긴다(누가·무엇을 얼마로).
    await this.audit.record(actor, {
      action: 'free_exposure.update',
      targetType: 'system_setting',
      targetId: FREE_EXPOSURE_KEY,
      summary: `무료 노출 범위 변경(구간별 ${current.perBandItems} → ${next.perBandItems})`,
      meta: { before: current, after: next },
    });
    return next;
  }

  // ── 등급별 비크레딧 혜택(전사, B218) ──
  // O50 에서 "크레딧으로는 볼륨 할인을 줄 수 없다"가 드러나 만든 축이다(배분 원가가 크레딧에 선형).
  // 전환율을 보며 조정하는 값이라 배포 없이 바꿀 수 있게 둔다.
  async getGradeBenefits(): Promise<Record<number, GradeBenefit>> {
    const row = await this.prisma.system_setting.findUnique({
      where: { key: GRADE_BENEFITS_KEY },
    });
    return resolveGradeBenefits(row?.value);
  }

  /**
   * 혜택 변경 — 전사 정책이라 본사(HQ) 관리자만.
   * 안전선을 넘으면 거부한다: 큐 가중치가 커지면 하위 등급 질문이 기아 상태가 되고,
   * AI 리포트는 유일하게 실원가가 붙는 축이라 상한이 곧 원가 상한이다.
   */
  async updateGradeBenefits(
    dto: UpdateGradeBenefitsDto,
    actor: AuthUser,
  ): Promise<Record<number, GradeBenefit>> {
    if (!this.isHq(actor)) {
      throw new ForbiddenException(
        '등급 혜택은 본사 관리자만 변경할 수 있습니다.',
      );
    }
    // 등급은 화이트리스트로만 돈다 — Object.entries(dto) 는 인덱스 시그니처가 없어
    // [string, any] 오버로드를 타므로(타입 안전성 상실) 명시 목록을 쓴다.
    // 부수 효과로 "오타로 새 등급이 생기는 것"도 구조적으로 막힌다.
    const EDITABLE_TIERS = [1, 2, 3, 4] as const;
    const g = GRADE_BENEFITS_GUARD;
    const CAPS = [
      ['qnaQueueWeight', g.maxQnaQueueWeight],
      ['aiReportsPerMonth', g.maxAiReportsPerMonth],
      ['matchHorizonDays', g.maxMatchHorizonDays],
      ['concurrentBookings', g.maxConcurrentBookings],
    ] as const;

    for (const tier of EDITABLE_TIERS) {
      const patch = dto[tier];
      if (!patch) continue;
      const over = CAPS.find(([k, max]) => {
        const v = patch[k];
        return typeof v === 'number' && v > max;
      });
      if (over) {
        throw new BadRequestException(
          `등급 ${tier} 의 ${over[0]} 는 최대 ${over[1]} 까지입니다.`,
        );
      }
    }

    const current = await this.getGradeBenefits();
    const next: Record<number, GradeBenefit> = { ...current };
    const applied: number[] = [];
    for (const tier of EDITABLE_TIERS) {
      const patch = dto[tier];
      if (!patch || !next[tier]) continue;
      next[tier] = { ...next[tier], ...patch };
      applied.push(tier);
    }

    // ── 3층 정합 불변식(B221) ──
    // 감당할 수 없는 양의 권리를 파는 것을 **쓰기 시점에** 막는다. 이게 없으면
    // "월 20건 × 100명"을 팔아 놓고 전역 상한이 거절하는 상태가 다시 만들어진다.
    // 권리를 **줄이는** 방향은 언제나 허용한다(정합이 나빠질 수 없다).
    const raisesEntitlement = EDITABLE_TIERS.some((t) => {
      const v = dto[t]?.aiReportsPerMonth;
      return typeof v === 'number' && v > current[t].aiReportsPerMonth;
    });
    if (raisesEntitlement) {
      const policy = await this.getAiUsage();
      const check = reconcileCapacity({
        benefits: next,
        usersByTier: await this.usersByTier(),
        purposeDailyLimit: this.entitledPurposeDailyLimit(),
        peakFactor: policy.peakFactor,
      });
      if (!check.ok) {
        throw new BadRequestException(
          capacityMessage(check, AI_REPORT_PURPOSE),
        );
      }
    }

    // Prisma JSON 은 명명 인터페이스를 InputJsonValue 로 받지 않는다 —
    // 각 항목을 전개해 순수 객체 리터럴로 만든 뒤 넘긴다(free-exposure 와 같은 처리).
    // 값 타입을 Prisma.InputJsonValue 로 못박아야 JSON 컬럼에 대입된다
    // (Record<string, unknown> 은 unknown 이 JSON 안전하지 않아 거부된다).
    const asJson: Record<string, Prisma.InputJsonValue> = {};
    for (const [tier, b] of Object.entries(next)) asJson[tier] = { ...b };
    await this.prisma.system_setting.upsert({
      where: { key: GRADE_BENEFITS_KEY },
      create: {
        key: GRADE_BENEFITS_KEY,
        value: asJson,
        updated_by: actor.id,
      },
      update: {
        value: asJson,
        updated_by: actor.id,
        updated_at: new Date(),
      },
    });
    // 혜택은 과금 상품의 구성이라 변경 이력을 남긴다(분쟁 시 "그때 무엇을 팔았나"의 근거).
    await this.audit.record(actor, {
      action: 'grade_benefits.update',
      targetType: 'system_setting',
      targetId: GRADE_BENEFITS_KEY,
      summary: `등급 혜택 변경(${applied.join(',')} 등급)`,
      meta: { before: current, after: next },
    });
    return next;
  }

  // ── AI 사용량 정책(전사, B221) ──
  async getAiUsage(): Promise<AiUsagePolicy> {
    const row = await this.prisma.system_setting.findUnique({
      where: { key: AI_USAGE_KEY },
    });
    return resolveAiUsage(row?.value);
  }

  /** 등급 권리가 소비하는 용도의 일 상한(ENV 우선, 없으면 B008 기본값). */
  private entitledPurposeDailyLimit(): number {
    return envInt(
      this.config.get<string>(llmDailyLimitEnvKey(AI_REPORT_PURPOSE)),
      LLM_DEFAULT_LIMITS[AI_REPORT_PURPOSE],
    );
  }

  /** 등급별 유료 회원 수 — 3층 정합 계산의 입력. 구독 중(활성) 학생만 센다. */
  private async usersByTier(): Promise<Record<number, number>> {
    const rows = await this.prisma.student_profile.groupBy({
      by: ['membership_grade_id'],
      _count: { account_id: true },
      where: { membership_grade_id: { not: null } },
    });
    const grades = await this.prisma.membership_grade.findMany({
      select: { id: true, tier: true },
    });
    const tierOf = new Map(grades.map((g) => [g.id, g.tier]));
    const out: Record<number, number> = {};
    for (const r of rows) {
      const tier = r.membership_grade_id
        ? tierOf.get(r.membership_grade_id)
        : undefined;
      if (tier == null) continue;
      out[tier] = (out[tier] ?? 0) + r._count.account_id;
    }
    return out;
  }

  /**
   * 3층 정합 조회 — "지금 판 권리를 감당할 수 있나". 운영자가 혜택을 올리기 전에 본다.
   * `GET /admin/ai-capacity`
   */
  async getAiCapacity() {
    const [benefits, policy, usersByTier] = await Promise.all([
      this.getGradeBenefits(),
      this.getAiUsage(),
      this.usersByTier(),
    ]);
    const purposeDailyLimit = this.entitledPurposeDailyLimit();
    const check = reconcileCapacity({
      benefits,
      usersByTier,
      purposeDailyLimit,
      peakFactor: policy.peakFactor,
    });
    return {
      purpose: AI_REPORT_PURPOSE,
      purposeDailyLimit,
      peakFactor: policy.peakFactor,
      ...check,
      // 상한 0 이하(무제한)면 available/usable 이 Infinity 라 JSON 에서 null 로 나간다.
      // 운영자가 "값 없음"과 구분할 수 있게 플래그로 못박는다.
      unlimited: !Number.isFinite(check.availablePerDay),
      // 감당 못 하면 무엇을 해야 하는지까지 알려 준다.
      advice: check.ok ? null : capacityMessage(check, AI_REPORT_PURPOSE),
    };
  }

  async updateAiUsage(
    dto: UpdateAiUsageDto,
    actor: AuthUser,
  ): Promise<AiUsagePolicy> {
    if (!this.isHq(actor)) {
      throw new ForbiddenException(
        'AI 사용량 정책은 본사 관리자만 변경할 수 있습니다.',
      );
    }
    const g = AI_USAGE_GUARD;
    if (
      dto.reportReviewPerUserDay !== undefined &&
      dto.reportReviewPerUserDay > g.maxReportReviewPerUserDay
    ) {
      throw new BadRequestException(
        `사용자 일 신고 AI 검토는 최대 ${g.maxReportReviewPerUserDay} 회까지입니다.`,
      );
    }
    if (
      dto.reservePctForEntitled !== undefined &&
      dto.reservePctForEntitled > g.maxReservePct
    ) {
      throw new BadRequestException(
        `예약분 비율은 최대 ${g.maxReservePct} 까지입니다. 더 올리면 관리자 업무(재량 용도)가 상시 막힙니다.`,
      );
    }
    if (
      dto.peakFactor !== undefined &&
      (dto.peakFactor < g.minPeakFactor || dto.peakFactor > g.maxPeakFactor)
    ) {
      throw new BadRequestException(
        `피크 계수는 ${g.minPeakFactor}~${g.maxPeakFactor} 범위여야 합니다.`,
      );
    }
    const current = await this.getAiUsage();
    const next: AiUsagePolicy = { ...current, ...dto };
    await this.prisma.system_setting.upsert({
      where: { key: AI_USAGE_KEY },
      create: { key: AI_USAGE_KEY, value: { ...next }, updated_by: actor.id },
      update: {
        value: { ...next },
        updated_by: actor.id,
        updated_at: new Date(),
      },
    });
    await this.audit.record(actor, {
      action: 'ai_usage.update',
      targetType: 'system_setting',
      targetId: AI_USAGE_KEY,
      summary: `AI 사용량 정책 변경(예약분 ${current.reservePctForEntitled} → ${next.reservePctForEntitled})`,
      meta: { before: current, after: next },
    });
    return next;
  }

  // ── 한도(센터) ── HQ 는 센터 미소속이라 기본값만 반환(편집은 센터 관리자)
  async getLimits(actor: AuthUser) {
    if (this.isHq(actor))
      return {
        center_id: null,
        reservation_limit: null,
        classify_fit_limit: 10,
        classify_unfit_limit: 30,
      };
    const centerId = this.requireCenter(actor);
    const lp = await this.prisma.limit_policy.findUnique({
      where: { center_id: centerId },
    });
    return (
      lp ?? {
        center_id: centerId,
        reservation_limit: null,
        classify_fit_limit: 10,
        classify_unfit_limit: 30,
      }
    );
  }

  async updateLimits(dto: UpdateLimitsDto, actor: AuthUser) {
    const centerId = this.requireCenter(actor);
    const existing = await this.prisma.limit_policy.findUnique({
      where: { center_id: centerId },
    });
    const data = {
      reservation_limit:
        dto.reservationLimit ?? existing?.reservation_limit ?? null,
      classify_fit_limit:
        dto.classifyFitLimit ?? existing?.classify_fit_limit ?? 10,
      classify_unfit_limit:
        dto.classifyUnfitLimit ?? existing?.classify_unfit_limit ?? 30,
    };
    const saved = await this.prisma.limit_policy.upsert({
      where: { center_id: centerId },
      update: data,
      create: { center_id: centerId, ...data },
    });
    await this.audit.record(actor, {
      action: 'limits.update',
      targetType: 'limit_policy',
      targetId: centerId,
      summary: '한도 정책 변경(센터)',
      meta: data,
    });
    return saved;
  }

  // ── 가중 제한 임계(센터, §5-7) ── HQ 는 기본값만(편집은 센터 관리자)
  async getPenalty(actor: AuthUser) {
    if (this.isHq(actor))
      return {
        center_id: null,
        cancel_threshold: null,
        noshow_threshold: null,
        reject_threshold: null,
        restrict_minutes: null,
        ranking_weight_down: null,
      };
    const centerId = this.requireCenter(actor);
    const p = await this.prisma.penalty_policy.findUnique({
      where: { center_id: centerId },
    });
    return (
      p ?? {
        center_id: centerId,
        cancel_threshold: null,
        noshow_threshold: null,
        reject_threshold: null,
        restrict_minutes: null,
        ranking_weight_down: null,
      }
    );
  }

  async updatePenalty(dto: UpdatePenaltyDto, actor: AuthUser) {
    const centerId = this.requireCenter(actor);
    const existing = await this.prisma.penalty_policy.findUnique({
      where: { center_id: centerId },
    });
    const data = {
      cancel_threshold:
        dto.cancelThreshold ?? existing?.cancel_threshold ?? null,
      noshow_threshold:
        dto.noshowThreshold ?? existing?.noshow_threshold ?? null,
      reject_threshold:
        dto.rejectThreshold ?? existing?.reject_threshold ?? null,
      restrict_minutes:
        dto.restrictMinutes ?? existing?.restrict_minutes ?? null,
      ranking_weight_down:
        dto.rankingWeightDown ?? existing?.ranking_weight_down ?? null,
    };
    const saved = await this.prisma.penalty_policy.upsert({
      where: { center_id: centerId },
      update: data,
      create: { center_id: centerId, ...data },
    });
    await this.audit.record(actor, {
      action: 'penalty.update',
      targetType: 'penalty_policy',
      targetId: centerId,
      summary: '가중 제한 임계 변경(센터)',
      meta: data,
    });
    return saved;
  }

  // ── 기능 토글(전사 강제 + 센터 자율) ──
  getFeatures() {
    return this.prisma.feature_availability.findMany();
  }

  async setFeature(dto: SetFeatureDto, actor: AuthUser) {
    // 전사 강제 토글은 본사(HQ)만, 센터 자율 토글은 센터 관리자
    if (dto.scope === '전사' && !this.isHq(actor)) {
      throw new ForbiddenException(
        '전사 기능 토글은 본사 관리자만 가능합니다.',
      );
    }
    const centerId = dto.scope === '전사' ? null : this.requireCenter(actor);
    const existing = await this.prisma.feature_availability.findFirst({
      where: {
        scope: dto.scope,
        center_id: centerId,
        target_type: dto.targetType,
        target_value: dto.targetValue,
      },
    });
    const saved = existing
      ? await this.prisma.feature_availability.update({
          where: { id: existing.id },
          data: { enabled: dto.enabled },
        })
      : await this.prisma.feature_availability.create({
          data: {
            scope: dto.scope,
            center_id: centerId,
            target_type: dto.targetType,
            target_value: dto.targetValue,
            enabled: dto.enabled,
          },
        });
    await this.audit.record(actor, {
      action: 'feature.toggle',
      targetType: 'feature_availability',
      targetId: saved.id,
      summary: `기능 토글 ${dto.enabled ? '열림' : '닫힘'}(${dto.scope} · ${dto.targetType}:${dto.targetValue})`,
      meta: {
        scope: dto.scope,
        targetType: dto.targetType,
        targetValue: dto.targetValue,
        enabled: dto.enabled,
      },
    });
    return saved;
  }

  /** 특정 대상의 기능 활성 여부(전사 우선, 외부생 유형 강제 반영). */
  async resolveFeature(
    centerId: string | null,
    targetType: string,
    targetValue: string,
    studentType?: 'enrolled' | 'external',
  ) {
    const rows = await this.prisma.feature_availability.findMany({
      where: { target_type: targetType, target_value: targetValue },
    });
    const rules: FeatureRule[] = rows.map((r) => ({
      scope: r.scope,
      centerId: r.center_id,
      targetType: r.target_type,
      targetValue: r.target_value,
      enabled: r.enabled,
    }));
    return {
      targetType,
      targetValue,
      enabled: resolveFeatureEnabled(rules, {
        centerId,
        targetType,
        targetValue,
        studentType,
      }),
    };
  }

  private requireCenter(actor: AuthUser): string {
    if (!actor.centerId)
      throw new BadRequestException(
        '센터 소속 관리자만 정책을 편집할 수 있습니다.',
      );
    return actor.centerId;
  }
}
