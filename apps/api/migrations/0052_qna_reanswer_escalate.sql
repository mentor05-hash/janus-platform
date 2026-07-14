-- 상담승격/재답변(Q&A 감사 우선순위 3) — 재답변 횟수/사유 + 상담 승격 예약 링크.
ALTER TABLE qna_post
  ADD COLUMN IF NOT EXISTS reanswer_count       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reanswer_reason      text,
  ADD COLUMN IF NOT EXISTS escalated_booking_id uuid;
