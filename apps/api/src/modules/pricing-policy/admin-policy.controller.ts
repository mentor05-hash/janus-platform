import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminPolicyService } from './admin-policy.service';
import {
  SetFeatureDto,
  UpdateFreeExposureDto,
  UpdateGradeBenefitsDto,
  UpdateLimitsDto,
  UpdatePenaltyDto,
  UpdatePricingDto,
} from './dto/admin-policy.dto';

/**
 * 관리자 정책 편집 (CLAUDE.md §5-2/8/9). 관리자 전용(fail-closed).
 */
@Controller('admin')
@Roles('admin')
export class AdminPolicyController {
  constructor(private readonly policy: AdminPolicyService) {}

  @Get('pricing')
  getPricing(@CurrentUser() user: AuthUser) {
    return this.policy.getPricing(user);
  }

  @Put('pricing')
  updatePricing(@Body() dto: UpdatePricingDto, @CurrentUser() user: AuthUser) {
    return this.policy.updatePricing(dto, user);
  }

  // 무료 노출 범위(N24) — 법률 회신에 따라 조정하는 값. 변경 이력은 감사 로그에 남는다.
  @Get('free-exposure')
  getFreeExposure() {
    return this.policy.getFreeExposure();
  }

  @Put('free-exposure')
  updateFreeExposure(
    @Body() dto: UpdateFreeExposureDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.policy.updateFreeExposure(dto, user);
  }

  // 등급별 비크레딧 혜택(B218) — 전환율 보며 조정하는 값. 안전선 초과는 서버가 거부.
  @Get('grade-benefits')
  getGradeBenefits() {
    return this.policy.getGradeBenefits();
  }

  @Put('grade-benefits')
  updateGradeBenefits(
    @Body() dto: UpdateGradeBenefitsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.policy.updateGradeBenefits(dto, user);
  }

  @Get('limits')
  getLimits(@CurrentUser() user: AuthUser) {
    return this.policy.getLimits(user);
  }

  @Put('limits')
  updateLimits(@Body() dto: UpdateLimitsDto, @CurrentUser() user: AuthUser) {
    return this.policy.updateLimits(dto, user);
  }

  @Get('penalty-policy')
  getPenalty(@CurrentUser() user: AuthUser) {
    return this.policy.getPenalty(user);
  }

  @Put('penalty-policy')
  updatePenalty(@Body() dto: UpdatePenaltyDto, @CurrentUser() user: AuthUser) {
    return this.policy.updatePenalty(dto, user);
  }

  @Get('feature-availability')
  getFeatures() {
    return this.policy.getFeatures();
  }

  @Put('feature-availability')
  setFeature(@Body() dto: SetFeatureDto, @CurrentUser() user: AuthUser) {
    return this.policy.setFeature(dto, user);
  }
}
