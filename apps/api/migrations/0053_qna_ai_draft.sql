-- Q3 AI 초안 자동 등록 — 질문에 대한 AI 1차 초안을 게시(사람이 보완/수정/새답변).
ALTER TABLE qna_post
  ADD COLUMN IF NOT EXISTS ai_draft    text,
  ADD COLUMN IF NOT EXISTS ai_draft_at timestamptz;
