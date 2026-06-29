import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  FeatureRule,
  resolveFeatureEnabled,
} from '../availability/domain/feature';
import { bumpPricingVersion } from './pricing-cache';
import {
  SetFeatureDto,
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
  ) {}

  /** 본사(HQ) 슈퍼관리자 = admin + 센터 미소속(center_id NULL). 전사 정책을 편집·전역 권한. */
  private isHq(actor: AuthUser): boolean {
    return actor.role === 'admin' && !actor.centerId;
  }

  // ── 요금: 전사 기본(center_id NULL, HQ 편집) + 센터 override(center_id=actor.center) ──
  async getPricing(actor: AuthUser) {
    if (this.isHq(actor)) {
      return this.prisma.pricing_policy.findMany({ where: { center_id: null }, orderBy: { mode: 'asc' } });
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
      throw new BadRequestException('게시판 문항 단가는 일반 단가 이상이어야 합니다.');
    }
    const data = {
      enabled: dto.enabled ?? existing?.enabled ?? true,
      per_hour: dto.perHour ?? existing?.per_hour ?? 0,
      surcharge_pct: dto.surchargePct ?? existing?.surcharge_pct ?? 0,
      board_item_fee: item,
      board_general_fee: general,
      offline_occupancy_fee: dto.offlineOccupancyFee ?? existing?.offline_occupancy_fee ?? null,
      paid_consulting_fee: dto.paidConsultingFee ?? existing?.paid_consulting_fee ?? null,
      updated_by: actor.id,
      updated_at: new Date(),
    };
    const saved = existing
      ? await this.prisma.pricing_policy.update({ where: { id: existing.id }, data })
      : await this.prisma.pricing_policy.create({ data: { center_id: targetCenter, mode: dto.mode, paid: true, ...data } });
    await bumpPricingVersion(this.cache, saved.updated_at?.getTime() ?? Date.now()); // §10 캐시 무효화
    return saved;
  }

  // ── 한도(센터) ── HQ 는 센터 미소속이라 기본값만 반환(편집은 센터 관리자)
  async getLimits(actor: AuthUser) {
    if (this.isHq(actor)) return { center_id: null, reservation_limit: null, classify_fit_limit: 10, classify_unfit_limit: 30 };
    const centerId = this.requireCenter(actor);
    const lp = await this.prisma.limit_policy.findUnique({ where: { center_id: centerId } });
    return lp ?? { center_id: centerId, reservation_limit: null, classify_fit_limit: 10, classify_unfit_limit: 30 };
  }

  async updateLimits(dto: UpdateLimitsDto, actor: AuthUser) {
    const centerId = this.requireCenter(actor);
    const existing = await this.prisma.limit_policy.findUnique({ where: { center_id: centerId } });
    const data = {
      reservation_limit: dto.reservationLimit ?? existing?.reservation_limit ?? null,
      classify_fit_limit: dto.classifyFitLimit ?? existing?.classify_fit_limit ?? 10,
      classify_unfit_limit: dto.classifyUnfitLimit ?? existing?.classify_unfit_limit ?? 30,
    };
    return this.prisma.limit_policy.upsert({
      where: { center_id: centerId },
      update: data,
      create: { center_id: centerId, ...data },
    });
  }

  // ── 가중 제한 임계(센터, §5-7) ── HQ 는 기본값만(편집은 센터 관리자)
  async getPenalty(actor: AuthUser) {
    if (this.isHq(actor))
      return { center_id: null, cancel_threshold: null, noshow_threshold: null, reject_threshold: null, restrict_minutes: null, ranking_weight_down: null };
    const centerId = this.requireCenter(actor);
    const p = await this.prisma.penalty_policy.findUnique({ where: { center_id: centerId } });
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
    const existing = await this.prisma.penalty_policy.findUnique({ where: { center_id: centerId } });
    const data = {
      cancel_threshold: dto.cancelThreshold ?? existing?.cancel_threshold ?? null,
      noshow_threshold: dto.noshowThreshold ?? existing?.noshow_threshold ?? null,
      reject_threshold: dto.rejectThreshold ?? existing?.reject_threshold ?? null,
      restrict_minutes: dto.restrictMinutes ?? existing?.restrict_minutes ?? null,
      ranking_weight_down: dto.rankingWeightDown ?? existing?.ranking_weight_down ?? null,
    };
    return this.prisma.penalty_policy.upsert({
      where: { center_id: centerId },
      update: data,
      create: { center_id: centerId, ...data },
    });
  }

  // ── 기능 토글(전사 강제 + 센터 자율) ──
  getFeatures() {
    return this.prisma.feature_availability.findMany();
  }

  async setFeature(dto: SetFeatureDto, actor: AuthUser) {
    // 전사 강제 토글은 본사(HQ)만, 센터 자율 토글은 센터 관리자
    if (dto.scope === '전사' && !this.isHq(actor)) {
      throw new ForbiddenException('전사 기능 토글은 본사 관리자만 가능합니다.');
    }
    const centerId = dto.scope === '전사' ? null : this.requireCenter(actor);
    const existing = await this.prisma.feature_availability.findFirst({
      where: { scope: dto.scope, center_id: centerId, target_type: dto.targetType, target_value: dto.targetValue },
    });
    if (existing) {
      return this.prisma.feature_availability.update({ where: { id: existing.id }, data: { enabled: dto.enabled } });
    }
    return this.prisma.feature_availability.create({
      data: {
        scope: dto.scope,
        center_id: centerId,
        target_type: dto.targetType,
        target_value: dto.targetValue,
        enabled: dto.enabled,
      },
    });
  }

  /** 특정 대상의 기능 활성 여부(전사 우선). */
  async resolveFeature(centerId: string | null, targetType: string, targetValue: string) {
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
    return { targetType, targetValue, enabled: resolveFeatureEnabled(rules, { centerId, targetType, targetValue }) };
  }

  private requireCenter(actor: AuthUser): string {
    if (!actor.centerId) throw new BadRequestException('센터 소속 관리자만 정책을 편집할 수 있습니다.');
    return actor.centerId;
  }
}
