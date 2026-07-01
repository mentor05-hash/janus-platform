import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
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

  /** GET /teachers/{id}/payroll — 예상급여(본인 또는 관리자/HR). */
  @Get(':id/payroll')
  estimate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payroll.estimate(id, user);
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
}
