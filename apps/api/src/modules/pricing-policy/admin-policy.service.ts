import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  FeatureRule,
  resolveFeatureEnabled,
} from '../availability/domain/feature';
import { UpdateLimitsDto, UpdatePricingDto, SetFeatureDto } from './dto/admin-policy.dto';

/**
 * 관리자 정책 편집 (CLAUDE.md §5-2/8/9). 요금·한도·기능토글 단일 소스.
 * 변경은 즉시 반영(PricingService·슬롯 게이트가 같은 테이블을 읽음).
 */
@Injectable()
export class AdminPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 요금(전사 기본 center_id NULL) ──
  getPricing() {
    return this.prisma.pricing_policy.findMany({ where: { center_id: null }, orderBy: { mode: 'asc' } });
  }

  async updatePricing(dto: UpdatePricingDto, actor: AuthUser) {
    const existing = await this.prisma.pricing_policy.findFirst({
      where: { center_id: null, mode: dto.mode as never },
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
    return existing
      ? this.prisma.pricing_policy.update({ where: { id: existing.id }, data })
      : this.prisma.pricing_policy.create({ data: { center_id: null, mode: dto.mode as never, paid: true, ...data } });
  }

  // ── 한도(센터) ──
  async getLimits(actor: AuthUser) {
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

  // ── 기능 토글(전사 강제 + 센터 자율) ──
  getFeatures() {
    return this.prisma.feature_availability.findMany();
  }

  async setFeature(dto: SetFeatureDto, actor: AuthUser) {
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
