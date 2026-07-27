import { Module } from '@nestjs/common';
import {
  PayrollAdminController,
  PayrollController,
} from './payroll.controller';
import { PayrollService } from './payroll.service';

/**
 * Payroll 바운디드 컨텍스트 (CLAUDE.md §3).
 * 예상급여(확정분+예상분) — 매출 배분 단일 모델(O113). 기준은 DB system_setting
 * (payroll_share_policy 배분율 · payroll_model_policy 모델). 건당 단가·ENV PAYROLL_* 는 폐지.
 */
@Module({
  controllers: [PayrollController, PayrollAdminController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
