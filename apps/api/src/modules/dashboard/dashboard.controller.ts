import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MinPerm } from '../../common/decorators/min-perm.decorator';
import type { UploadedFileLike } from '../storage/storage.types';
import { DashboardService } from './dashboard.service';
import {
  DashVisibilityDto,
  DirectorDto,
  MonthlyHoursDto,
  UpdateWeightsDto,
} from './dto/dashboard.dto';
import type { PivotView } from './dto/dashboard.dto';

/**
 * 대시보드 API (§D 권한 매트릭스). @Roles 로 1차 차단, 서비스 계층에서 센터 스코프 강제(fail-closed).
 * 설정 계열(가중치·원장)은 @MinPerm('L2') 본사급 이상.
 *
 * 클래스 기본은 **관리자 전용**이다(N37). 이전 기본값 `admin,hr` 한 줄이 메서드 6개
 * (`admin/dashboard/policy` 2 · `admin/teachers/*` 4 · `ops/*` 3)를 한꺼번에 HR 에게 열었는데,
 * 대응 화면(`infra`·`evaluation`·`analytics`)은 전부 관리자 전용이었다. 월간 시수·원장 지정은
 * 급여 산정의 기초값이라 O127(HR 은 급여에 권한이 없다)과도 어긋난다.
 */
@Controller()
@Roles('admin')
export class DashboardController {
  constructor(private readonly dash: DashboardService) {}

  /**
   * GET /dashboard/access — 내게 열린 대시보드 범위·탭(3형태 라우팅). 선생님 포함.
   * n37: 자기 범위 조회다 — 데이터가 아니라 "무엇이 열려 있는가"만 돌려준다. HR 의 착지
   *      화면(`dashboard`)이 탭을 그릴 때 필요하므로 화면 표 대신 이 성격으로 판정한다.
   */
  @Get('dashboard/access')
  @Roles('admin', 'hr', 'teacher')
  access(@CurrentUser() user: AuthUser) {
    return this.dash.access(user);
  }

  /** GET /me/dashboard — 선생님 본인 성과 대시보드(정책 게이팅). */
  @Get('me/dashboard')
  @Roles('teacher')
  myDashboard(@CurrentUser() user: AuthUser) {
    return this.dash.myDashboard(user);
  }

  /** GET /admin/dashboard/policy — 노출 정책 조회(관리자/HR). */
  @Get('admin/dashboard/policy')
  getPolicy() {
    return this.dash.getVisibility();
  }

  /** PUT /admin/dashboard/policy — 노출 정책 변경(본사급 L2만). */
  @Put('admin/dashboard/policy')
  @MinPerm('L2')
  setPolicy(@Body() dto: DashVisibilityDto, @CurrentUser() user: AuthUser) {
    return this.dash.setVisibility(user, dto);
  }

  // 화면 `evaluation` 은 관리자 전용(O181). 클래스 기본이 admin 이 된 뒤로 이 세 줄은
  // 중복이지만, 좁힌 근거가 O181 에 있으므로 명시를 남긴다.
  @Get('admin/evaluation/weights')
  @Roles('admin')
  getWeights(
    @CurrentUser() user: AuthUser,
    @Query('centerId') centerId?: string,
  ) {
    return this.dash.getWeights(user, centerId);
  }

  @Put('admin/evaluation/weights')
  @Roles('admin')
  @MinPerm('L2')
  updateWeights(@Body() dto: UpdateWeightsDto, @CurrentUser() user: AuthUser) {
    return this.dash.updateWeights(user, dto);
  }

  @Get('admin/evaluation/ranking')
  @Roles('admin')
  ranking(
    @CurrentUser() user: AuthUser,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('centerId') centerId?: string,
    @Query('director') director?: string,
  ) {
    return this.dash.ranking(user, { period, from, to, centerId, director });
  }

  @Put('admin/teachers/:id/monthly-hours')
  monthlyHours(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MonthlyHoursDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dash.setMonthlyHours(user, id, dto);
  }

  /** POST /admin/teachers/monthly-hours/excel — 월간 시수 엑셀 일괄 업로드. */
  @Post('admin/teachers/monthly-hours/excel')
  @UseInterceptors(FileInterceptor('file'))
  monthlyHoursExcel(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedFileLike,
  ) {
    return this.dash.bulkMonthlyHoursExcel(user, file.buffer);
  }

  /** GET /admin/teachers/monthly-hours/template — 업로드용 엑셀 템플릿. */
  @Get('admin/teachers/monthly-hours/template')
  monthlyHoursTemplate(@Res() res: Response) {
    const buf = this.dash.monthlyHoursTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="monthly-hours-template.xlsx"',
    );
    res.send(buf);
  }

  @Put('admin/teachers/:id/director')
  @MinPerm('L2')
  director(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DirectorDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dash.setDirector(user, id, dto);
  }

  @Get('ops/center-comparison')
  centerComparison(
    @CurrentUser() user: AuthUser,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.dash.centerComparison(user, { period, from, to });
  }

  @Get('ops/pivots/:view')
  pivots(
    @Param('view') view: PivotView,
    @CurrentUser() user: AuthUser,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('centerId') centerId?: string,
    @Query('teacherId') teacherId?: string,
  ) {
    return this.dash.pivots(user, view, {
      period,
      from,
      to,
      centerId,
      teacherId,
    });
  }

  /** GET /ops/consultation-stats — 상담기록 종류별 통계(§5). */
  @Get('ops/consultation-stats')
  consultationStats(
    @CurrentUser() user: AuthUser,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('centerId') centerId?: string,
  ) {
    return this.dash.consultationStats(user, { period, from, to, centerId });
  }
}
