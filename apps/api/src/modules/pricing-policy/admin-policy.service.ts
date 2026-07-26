import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import { PrismaService } from '../../common/prisma/prisma.service';
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
  SetFeatureDto,
  UpdateFreeExposureDto,
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
      meta: { mode: dto.mode, perHour: data.per_hour, surchargePct: data.surcharge_pct, enabled: data.enabled },
    });
    return saved;
  }

  // ── 무료 티어 노출 범위(전사, N24) ── 법률 회신에 따라 조정되는 값이라 배포 없이 바꿀 수 있게 둔다.
  async getFreeExposure(): Promise<FreeExposurePolicy> {
    const row = await this.prisma.system_setting.findUnique({ where: { key: FREE_EXPOSURE_KEY } });
    return resolveFreeExposure(row?.value);
  }

  /**
   * 무료 노출 범위 변경 — 전사 정책이라 본사(HQ) 관리자만.
   * 노출을 **늘리는** 방향은 데이터 권리 근거가 필요하므로 안전선을 넘으면 거부한다(B007 회신 전 실수 방지).
   */
  async updateFreeExposure(dto: UpdateFreeExposureDto, actor: AuthUser): Promise<FreeExposurePolicy> {
    if (!this.isHq(actor)) {
      throw new ForbiddenException('무료 노출 범위는 본사 관리자만 변경할 수 있습니다.');
    }
    if (dto.perBandItems !== undefined && dto.perBandItems > FREE_EXPOSURE_GUARD.maxPerBandItems) {
      throw new BadRequestException(
        `무료 노출은 구간별 최대 ${FREE_EXPOSURE_GUARD.maxPerBandItems}개까지입니다. 더 늘리려면 데이터 권리 검토 결과가 선행되어야 합니다.`,
      );
    }
    const current = await this.getFreeExposure();
    const next: FreeExposurePolicy = { ...current, ...dto };
    await this.prisma.system_setting.upsert({
      where: { key: FREE_EXPOSURE_KEY },
      create: { key: FREE_EXPOSURE_KEY, value: { ...next }, updated_by: actor.id },
      update: { value: { ...next }, updated_by: actor.id, updated_at: new Date() },
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
      action: 'limits.update', targetType: 'limit_policy', targetId: centerId,
      summary: '한도 정책 변경(센터)', meta: data,
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
      action: 'penalty.update', targetType: 'penalty_policy', targetId: centerId,
      summary: '가중 제한 임계 변경(센터)', meta: data,
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
      action: 'feature.toggle', targetType: 'feature_availability', targetId: saved.id,
      summary: `기능 토글 ${dto.enabled ? '열림' : '닫힘'}(${dto.scope} · ${dto.targetType}:${dto.targetValue})`,
      meta: { scope: dto.scope, targetType: dto.targetType, targetValue: dto.targetValue, enabled: dto.enabled },
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
