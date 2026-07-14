import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { GuardianReportService } from './guardian-report.service';

/** 학부모 통합 리포트 — 연결된 자녀의 주간 요약(성적·출석·상담·Q&A). */
@Controller('guardian')
@Roles('guardian')
export class GuardianReportController {
  constructor(private readonly svc: GuardianReportService) {}

  /** GET /guardian/children — 연결된 자녀 목록(리포트 대상 선택). */
  @Get('children')
  children(@CurrentUser() user: AuthUser) {
    return this.svc.children(user);
  }

  /** GET /guardian/report?studentId=&days= — 주간 통합 리포트(기본 7일, 최대 31). */
  @Get('report')
  report(@CurrentUser() user: AuthUser, @Query('studentId') studentId?: string, @Query('days') days?: string) {
    if (!studentId) throw new BadRequestException('studentId 가 필요합니다.');
    const d = days ? Math.min(31, Math.max(1, Math.round(Number(days)))) : 7;
    return this.svc.report(user, studentId, Number.isFinite(d) ? d : 7);
  }
}
