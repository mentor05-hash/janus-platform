import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminPolicyService } from './admin-policy.service';
import {
  SetFeatureDto,
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
