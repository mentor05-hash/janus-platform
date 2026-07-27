import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ChargeInput,
  PaymentProvider,
  PaymentProviderStatus,
} from './payment.types';

// 수동/모의 결제 provider — 관리자 확인으로 paid 처리. 실 PG는 이 구현체만 교체하면 됨.
@Injectable()
export class ManualPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger('PaymentProvider:manual');

  async createCharge(input: ChargeInput): Promise<{ providerRef: string }> {
    const providerRef = `manual:${randomUUID()}`;
    this.logger.log(
      `createCharge app=${input.applicationId} ${input.amountWon}원 → ${providerRef}`,
    );
    return { providerRef };
  }

  async confirm(providerRef: string): Promise<PaymentProviderStatus> {
    this.logger.log(`confirm ${providerRef} → paid`);
    return 'paid';
  }

  async refund(
    providerRef: string,
    amountWon: number,
  ): Promise<PaymentProviderStatus> {
    this.logger.log(`refund ${providerRef} ${amountWon}원 → refunded`);
    return 'refunded';
  }
}
