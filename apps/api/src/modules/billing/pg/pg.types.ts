/**
 * PgProvider 어댑터 인터페이스 (CLAUDE.md §9 O2·§10).
 * 로컬은 mock 승인, 클라우드는 실 PG(Toss/PortOne 등) 연동으로 교체
 * (코드 변경 없이 ENV PG_PROVIDER 전환). 정기결제(autopay)도 이 어댑터로 청구.
 */
export const PG_PROVIDER = Symbol('PG_PROVIDER');

export interface ChargeInput {
  payerAccountId: string;
  amount: number;
  purpose: string;
  /** 멱등키 — 같은 청구의 중복 승인 방지(실 PG 의 idempotency-key 로 매핑). */
  idempotencyKey: string;
}

export interface ChargeResult {
  transactionId: string;
  status: 'done' | 'failed';
}

export interface PgProvider {
  charge(input: ChargeInput): Promise<ChargeResult>;
}
