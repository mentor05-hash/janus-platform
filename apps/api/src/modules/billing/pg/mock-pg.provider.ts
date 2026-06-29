import { Injectable, Logger } from '@nestjs/common';
import { ChargeInput, ChargeResult, PgProvider } from './pg.types';

/**
 * 로컬 stub PgProvider — 항상 승인. 거래 ID 는 멱등키 기반 결정적.
 * 실 PG(§9 O2 미결정)가 정해지면 RealPgProvider 로 교체.
 */
@Injectable()
export class MockPgProvider implements PgProvider {
  private readonly logger = new Logger('PgProvider:mock');

  async charge(input: ChargeInput): Promise<ChargeResult> {
    if (input.amount <= 0) return { transactionId: '', status: 'failed' };
    const transactionId = `mock_${input.idempotencyKey}`;
    this.logger.log(`[stub] 승인 payer=${input.payerAccountId} amount=${input.amount} (${input.purpose})`);
    return { transactionId, status: 'done' };
  }
}
