-- 0038: PG 결제 도메인 흐름 준비 — 웹훅 멱등 원장 + 결제 멱등키.
--   벤더 미연동 상태에서도 웹훅 수신·중복처리 방지·환불 원장 구조를 갖춰, 실 PG 연결 시
--   provider 어댑터만 붙이면 되도록 한다(§9 O2·§10).

-- 결제 멱등키(같은 청구의 웹훅 중복/재시도로 인한 이중 충전 방지). 유니크.
ALTER TABLE payment
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS refunded_at    timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS payment_idempotency_key_uq
  ON payment (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 웹훅 이벤트 멱등 원장 — PG 는 웹훅을 재전송하므로 (provider,event_id) 로 1회만 처리.
CREATE TABLE IF NOT EXISTS payment_event (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     text        NOT NULL,
  event_id     text        NOT NULL,
  type         text        NOT NULL,
  payment_id   uuid        REFERENCES payment(id) ON DELETE SET NULL,
  payload      jsonb,
  status       text        NOT NULL DEFAULT 'received', -- received|processed|ignored|failed
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, event_id)
);
CREATE INDEX IF NOT EXISTS payment_event_status_idx ON payment_event (status, created_at);
