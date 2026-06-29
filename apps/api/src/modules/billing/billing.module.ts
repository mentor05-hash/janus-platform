import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { CreditService } from './credit.service';
import { PaymentRequestController } from './payment-request.controller';
import { PaymentRequestService } from './payment-request.service';
import { WeeklyGrantService } from './weekly-grant.service';

/**
 * Billing 바운디드 컨텍스트 (CLAUDE.md §3).
 * 크레딧 계좌·거래·소비순서(§5-3)·주간부여 스케줄러·결제요청 3경로. booking 이 소비에 의존.
 */
@Module({
  controllers: [BillingController, PaymentRequestController],
  providers: [CreditService, WeeklyGrantService, PaymentRequestService],
  exports: [CreditService],
})
export class BillingModule {}
