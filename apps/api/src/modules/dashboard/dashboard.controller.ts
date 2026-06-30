import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { MinPerm } from '../../common/decorators/min-perm.decorator';
import { DashboardService } from './dashboard.service';
import { DirectorDto, MonthlyHoursDto, UpdateWeightsDto } from './dto/dashboard.dto';
import type { PivotView } from './dto/dashboard.dto';

/**
 * 대시보드 API (§D 권한 매트릭스). @Roles 로 1차 차단, 서비스 계층에서 센터 스코프 강제(fail-closed).
 * 설정 계열(가중치·원장)은 @MinPerm('L2') 본사급 이상.
 */
@Controller()
@Roles('admin', 'hr')
export class DashboardController {
  constructor(private readonly dash: DashboardService) {}

  @Get('admin/evaluation/weights')
  getWeights(@CurrentUser() user: AuthUser, @Query('centerId') centerId?: string) {
    return this.dash.getWeights(user, centerId);
  }

  @Put('admin/evaluation/weights')
  @MinPerm('L2')
  updateWeights(@Body() dto: UpdateWeightsDto, @CurrentUser() user: AuthUser) {
    return this.dash.updateWeights(user, dto);
  }

  @Get('admin/evaluation/ranking')
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
    return this.dash.pivots(user, view, { period, from, to, centerId, teacherId });
  }
}
