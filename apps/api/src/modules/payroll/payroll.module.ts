import { Module } from '@nestjs/common';
import { PayrollAdminController, PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

/**
 * Payroll 바운디드 컨텍스트 (CLAUDE.md §3).
 * 예상급여(확정분+예상분). 단가는 payroll_policy 또는 ENV(O20).
 */
@Module({
  controllers: [PayrollController, PayrollAdminController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
