import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MembershipService } from './membership.service';
import { SubscribeDto } from './dto/subscribe.dto';

@Controller()
export class MembershipController {
  constructor(private readonly membership: MembershipService) {}

  /** GET /subscription/plans — 구독 플랜 목록. */
  @Get('subscription/plans')
  plans() {
    return this.membership.listPlans();
  }

  /** GET /hr/membership-grades — 회원 등급·주간 부여량(HR/관리자). */
  @Get('hr/membership-grades')
  @Roles('hr', 'admin')
  grades() {
    return this.membership.listGrades();
  }

  /** GET /subscription/me — 내 활성 구독(학생). */
  @Get('subscription/me')
  @Roles('student')
  mine(@CurrentUser() user: AuthUser) {
    return this.membership.mySubscription(user);
  }

  /** POST /subscription/subscribe — 플랜 구독(학생). */
  @Post('subscription/subscribe')
  @Roles('student')
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: SubscribeDto) {
    return this.membership.subscribe(user, dto.planId);
  }
}
