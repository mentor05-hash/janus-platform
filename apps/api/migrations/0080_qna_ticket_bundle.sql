-- B1 질문권 묶음 상품 — 크레딧 선구매 질문권(FIFO 소진). 소진 순서: 주간무료→묶음→크레딧.
CREATE TABLE IF NOT EXISTS qna_ticket_bundle (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid NOT NULL,
  count         integer NOT NULL,
  remaining     integer NOT NULL,
  credits_paid  integer NOT NULL,
  unit_credits  integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_qna_ticket_bundle_student ON qna_ticket_bundle (student_id);
