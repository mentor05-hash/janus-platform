import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MembershipService } from './membership.service';
import { SubscribeDto, SubscribeForChildDto } from './dto/subscribe.dto';
import { UpdateGradeDto } from '../people/dto/hr.dto';

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

  /** PATCH /hr/membership-grades/{id} — 주간 부여 크레딧·활성 편집(HR/관리자). */
  @Patch('hr/membership-grades/:id')
  @Roles('hr', 'admin')
  updateGrade(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGradeDto,
  ) {
    return this.membership.updateGrade(id, dto);
  }

  /** GET /subscription/promo — 학부모 업셀 홍보 문구(인증). */
  @Get('subscription/promo')
  promo() {
    return this.membership.getPromo();
  }

  /** PATCH /subscription/promo — 홍보 문구 변경(본사 관리자). */
  @Patch('subscription/promo')
  @Roles('admin')
  setPromo(@CurrentUser() user: AuthUser, @Body() dto: { headline?: string; subcopy?: string; highlightPlanId?: string | null }) {
    return this.membership.setPromo(user, dto);
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

  /** POST /subscription/subscribe-for-child — 학부모가 자녀 대신 구독(승인 연결 자녀만). */
  @Post('subscription/subscribe-for-child')
  @Roles('guardian')
  subscribeForChild(@CurrentUser() user: AuthUser, @Body() dto: SubscribeForChildDto) {
    return this.membership.subscribeForChild(user, dto.studentId, dto.planId);
  }
}
