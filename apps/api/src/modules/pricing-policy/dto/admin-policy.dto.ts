import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ConsultMode } from '../../../config/enums';
import type { PlacementTier } from '../domain/grade-benefits';

/** PUT /admin/pricing — 방식별 요금 정책(전사 기본) 수정. */
export class UpdatePricingDto {
  @IsIn(['board', 'chat', 'zoom', 'hand', 'offline'])
  mode!: ConsultMode;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) perHour?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) surchargePct?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) boardItemFee?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) boardGeneralFee?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offlineOccupancyFee?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) paidConsultingFee?: number;
}

/** PUT /admin/limits — 한도 정책(센터). */
export class UpdateLimitsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) reservationLimit?:
    number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) classifyFitLimit?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  classifyUnfitLimit?: number;
}

/** PUT /admin/penalty-policy — 가중 제한 임계(센터, §5-7). */
export class UpdatePenaltyDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) cancelThreshold?:
    number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) noshowThreshold?:
    number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) rejectThreshold?:
    number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) restrictMinutes?:
    number | null;
  @IsOptional() @Type(() => Number) rankingWeightDown?: number | null;
}

/** PUT /admin/feature-availability — 기능 열기/닫기 토글. */
export class SetFeatureDto {
  @IsIn(['전사', '센터', '캠프', '외부생'])
  scope!: string;

  @IsString()
  targetType!: string; // category / mode / board / online / offline

  @IsString()
  targetValue!: string;

  @IsBoolean()
  enabled!: boolean;
}

/**
 * PUT /admin/free-exposure — 무료 티어 노출 범위(N24) 수정.
 * 전부 optional: 부분 변경을 허용하고 나머지는 현재 정책을 유지한다.
 */
export class UpdateFreeExposureDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) perBandItems?: number;
  @IsOptional() @IsBoolean() maskNumbers?: boolean;
  @IsOptional() @IsBoolean() allowSearch?: boolean;
  @IsOptional() @IsBoolean() allowDetail?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) showTrendYears?: number;
  @IsOptional() @IsBoolean() showConfidenceBadge?: boolean;
  @IsOptional() @IsBoolean() showRelTierBadge?: boolean;
}

/** 등급 하나의 비크레딧 혜택(B218). 전부 optional — 부분 변경 시 나머지는 현재 값 유지. */
export class UpdateGradeBenefitDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) qnaQueueWeight?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  concurrentBookings?: number;
  @IsOptional() @IsIn(['free', 'member', 'paid']) placementTier?: PlacementTier;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) aiReportsPerMonth?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) matchHorizonDays?: number;
}

/**
 * PUT /admin/grade-benefits — 회원 등급별 비크레딧 혜택(B218) 수정.
 * tier(1~4) 단위로 부분 변경한다. 예: `{ "4": { "aiReportsPerMonth": 8 } }`
 */
export class UpdateGradeBenefitsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateGradeBenefitDto)
  1?: UpdateGradeBenefitDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateGradeBenefitDto)
  2?: UpdateGradeBenefitDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateGradeBenefitDto)
  3?: UpdateGradeBenefitDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateGradeBenefitDto)
  4?: UpdateGradeBenefitDto;
}
