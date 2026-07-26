// 결제 provider 추상화 — 설계안 §6. 게이팅은 provider와 무관, Payment.status만 신뢰.
// 현재 ManualPaymentProvider(수동/모의). 실 PG(Toss·PortOne)는 이 인터페이스로 교체.
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type PaymentProviderStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface ChargeInput {
  applicationId: string;
  amountWon: number;
}

export interface PaymentProvider {
  createCharge(
    input: ChargeInput,
  ): Promise<{ providerRef: string; checkoutUrl?: string }>;
  confirm(providerRef: string): Promise<PaymentProviderStatus>;
  refund(
    providerRef: string,
    amountWon: number,
  ): Promise<PaymentProviderStatus>;
}
