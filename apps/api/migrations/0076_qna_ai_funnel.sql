-- P2 AI 즉답 퍼널 — 등록(ai_pending, 무료) → escalate(open, 과금·선생님 노출) 시점 기록.
ALTER TABLE qna_post ADD COLUMN IF NOT EXISTS escalated_at timestamptz;
