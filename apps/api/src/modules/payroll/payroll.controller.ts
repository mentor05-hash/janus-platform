import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PayrollService } from './payroll.service';

@Controller('teachers')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  /** GET /teachers/{id}/payroll/payslip — 명세서 데이터(본인/관리자). */
  @Get(':id/payroll/payslip')
  payslip(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Query('period') period?: string,
  ) {
    return this.payroll.payslip(id, user, period);
  }

  /** POST /teachers/{id}/payroll/pay — 지급완료 처리(관리자/HR). */
  @Post(':id/payroll/pay')
  @Roles('admin', 'hr')
  pay(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Query('period') period?: string,
  ) {
    return this.payroll.markPaid(id, user, period);
  }

  /** GET /teachers/{id}/payroll/revenue-share?period= — 매출배분(60%) 급여 명세(본인/관리자). */
  @Get(':id/payroll/revenue-share')
  revenueShare(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Query('period') period?: string,
  ) {
    return this.payroll.revenueSharePayslip(id, user, period);
  }

  /** GET /teachers/{id}/payroll — 예상급여(본인 또는 관리자/HR). */
  @Get(':id/payroll')
  estimate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Query('period') period?: string,
  ) {
    // period 미지정이면 이번 달(payslip 과 동일 규약) — 응답의 `period` 필드로 어느 달인지 밝힌다.
    return this.payroll.estimate(id, user, period);
  }

  /** POST /teachers/{id}/payroll/settle — 확정 정산 기록(관리자/HR). */
  @Post(':id/payroll/settle')
  @Roles('admin', 'hr')
  settle(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payroll.settle(id, user);
  }
}

@Controller('admin/payroll')
export class PayrollAdminController {
  constructor(private readonly payroll: PayrollService) {}

  /** GET /admin/payroll/report?period=YYYY-MM — 재무 정산 리포트(관리자/HR). */
  @Get('report')
  @Roles('admin', 'hr')
  report(@CurrentUser() user: AuthUser, @Query('period') period?: string) {
    return this.payroll.financeReport(user, period);
  }

  /** GET /admin/payroll/revenue-share?period= — 전임 매출배분(60%) 급여 요약(관리자/HR·센터 스코프). */
  @Get('revenue-share')
  @Roles('admin', 'hr')
  revenueShareList(@CurrentUser() user: AuthUser, @Query('period') period?: string) {
    return this.payroll.revenueShareList(user, period);
  }

  /** GET /admin/payroll/share-policy — 매출 배분율 조회. */
  @Get('share-policy')
  @Roles('admin', 'hr')
  getSharePolicy() {
    return this.payroll.getSharePolicy();
  }

  /** PATCH /admin/payroll/share-policy — 배분율 변경(본사 관리자). */
  @Patch('share-policy')
  @Roles('admin')
  setSharePolicy(@CurrentUser() user: AuthUser, @Body() dto: { sharePct?: number }) {
    return this.payroll.setSharePolicy(user, dto);
  }

  /** GET /admin/payroll/model — 급여 모델(배분/기본급보장/기본급+인센티브). */
  @Get('model')
  @Roles('admin', 'hr')
  getModel() {
    return this.payroll.getModelPolicy();
  }

  /** PATCH /admin/payroll/model — 급여 모델 변경(본사 관리자). */
  @Patch('model')
  @Roles('admin')
  setModel(@CurrentUser() user: AuthUser, @Body() dto: { mode?: string; base?: number; incentivePct?: number }) {
    return this.payroll.setModelPolicy(user, dto);
  }
}
