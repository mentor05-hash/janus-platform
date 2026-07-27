import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ClaimService } from './claim.service';
import {
  BusRouteUpsertDto,
  ClaimReviewDto,
  ClaimSubmitDto,
  ClassUpsertDto,
  CohortUpsertDto,
} from './dto/claim.dto';
import { LeadReplyDto } from './dto/lead.dto';

/** 학원 클레임·관리(운영자) — 세션 3. 신청·내 클레임 + 승인 후 반·버스·통계 편집. */
@Controller('claims')
@Roles('teacher', 'hr', 'admin')
export class ClaimController {
  constructor(private readonly svc: ClaimService) {}

  /** POST /claims — 클레임 신청. */
  @Post()
  submit(@CurrentUser() user: AuthUser, @Body() dto: ClaimSubmitDto) {
    return this.svc.submit(user, dto);
  }

  /** GET /claims/mine — 내 클레임 목록. */
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.svc.myClaims(user);
  }

  // ── 반 CRUD(승인 owner) ──
  @Post(':academyId/classes')
  createClass(
    @CurrentUser() user: AuthUser,
    @Param('academyId') academyId: string,
    @Body() dto: ClassUpsertDto,
  ) {
    return this.svc.createClass(user, academyId, dto);
  }

  @Patch(':academyId/classes/:classId')
  updateClass(
    @CurrentUser() user: AuthUser,
    @Param('academyId') academyId: string,
    @Param('classId') classId: string,
    @Body() dto: ClassUpsertDto,
  ) {
    return this.svc.updateClass(user, academyId, classId, dto);
  }

  @Delete(':academyId/classes/:classId')
  deleteClass(
    @CurrentUser() user: AuthUser,
    @Param('academyId') academyId: string,
    @Param('classId') classId: string,
  ) {
    return this.svc.deleteClass(user, academyId, classId);
  }

  // ── 버스 노선/정류장(승인 owner) ──
  @Post(':academyId/bus-routes')
  createRoute(
    @CurrentUser() user: AuthUser,
    @Param('academyId') academyId: string,
    @Body() dto: BusRouteUpsertDto,
  ) {
    return this.svc.createBusRoute(user, academyId, dto);
  }

  @Patch(':academyId/bus-routes/:routeId')
  updateRoute(
    @CurrentUser() user: AuthUser,
    @Param('academyId') academyId: string,
    @Param('routeId') routeId: string,
    @Body() dto: BusRouteUpsertDto,
  ) {
    return this.svc.updateBusRoute(user, academyId, routeId, dto);
  }

  @Delete(':academyId/bus-routes/:routeId')
  deleteRoute(
    @CurrentUser() user: AuthUser,
    @Param('academyId') academyId: string,
    @Param('routeId') routeId: string,
  ) {
    return this.svc.deleteBusRoute(user, academyId, routeId);
  }

  // ── 자가 통계(claimed) ──
  @Post(':academyId/cohort')
  upsertCohort(
    @CurrentUser() user: AuthUser,
    @Param('academyId') academyId: string,
    @Body() dto: CohortUpsertDto,
  ) {
    return this.svc.upsertCohort(user, academyId, dto);
  }

  // ── 리드 인박스(승인 owner) ──
  @Get(':academyId/leads')
  listLeads(
    @CurrentUser() user: AuthUser,
    @Param('academyId') academyId: string,
  ) {
    return this.svc.listLeads(user, academyId);
  }

  @Patch(':academyId/leads/:leadId')
  replyLead(
    @CurrentUser() user: AuthUser,
    @Param('academyId') academyId: string,
    @Param('leadId') leadId: string,
    @Body() dto: LeadReplyDto,
  ) {
    return this.svc.replyLead(user, academyId, leadId, dto);
  }
}

/** 운영자 클레임 심사(admin). */
@Controller('admin/claims')
@Roles('admin')
export class ClaimAdminController {
  constructor(private readonly svc: ClaimService) {}

  /** GET /admin/claims?status= — 심사 큐(기본 pending). */
  @Get()
  list(@Query('status') status?: string) {
    return this.svc.adminList(status);
  }

  /** POST /admin/claims/:id/review — 승인/반려. */
  @Post(':id/review')
  review(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: ClaimReviewDto,
  ) {
    return this.svc.review(admin, id, dto);
  }
}
