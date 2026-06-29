import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PayrollService } from './payroll.service';

@Controller('teachers')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  /** GET /teachers/{id}/payroll — 예상급여(본인 또는 관리자/HR). */
  @Get(':id/payroll')
  estimate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payroll.estimate(id, user);
  }
}
