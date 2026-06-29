import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingController } from './billing.controller';
import { CreditService } from './credit.service';
import { PaymentRequestController } from './payment-request.controller';
import { PaymentRequestService } from './payment-request.service';
import { WeeklyGrantService } from './weekly-grant.service';
import { AutopayService } from './autopay.service';
import { MockPgProvider } from './pg/mock-pg.provider';
import { RealPgProvider } from './pg/real-pg.provider';
import { PG_PROVIDER } from './pg/pg.types';

/**
 * Billing 바운디드 컨텍스트 (CLAUDE.md §3).
 * 크레딧 계좌·거래·소비순서(§5-3)·주간부여·결제요청 3경로·구독 정기결제(autopay).
 * PgProvider 어댑터는 ENV PG_PROVIDER 로 선택(mock 기본). booking 이 소비에 의존.
 */
@Module({
  controllers: [BillingController, PaymentRequestController],
  providers: [
    CreditService,
    WeeklyGrantService,
    PaymentRequestService,
    AutopayService,
    {
      provide: PG_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const which = config.get<string>('PG_PROVIDER') ?? 'mock';
        return !which || which === 'mock' ? new MockPgProvider() : new RealPgProvider(which);
      },
    },
  ],
  exports: [CreditService, AutopayService, PG_PROVIDER],
})
export class BillingModule {}
