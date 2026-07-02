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

/** PG 웹훅 정규화 이벤트 — 벤더별 페이로드를 이 형태로 매핑해 처리(§9 O2). */
export type PgWebhookType = 'payment.paid' | 'payment.failed' | 'payment.refunded';
export interface PgWebhookEvent {
  /** 벤더 고유 이벤트 ID — (provider,eventId) 로 멱등 처리. */
  eventId: string;
  type: PgWebhookType;
  /** 청구 멱등키 — 충전/환불 원장 매칭 키(payment.idempotency_key). */
  idempotencyKey: string;
  payerAccountId?: string;
  amount?: number;
  pgTxnId?: string;
}
