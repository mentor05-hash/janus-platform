-- P1(큐브 벤치마크): 주간 무료 질문권 — 무료로 등록된 질문 표시(주간 사용량 집계 기준).
-- 쿼터 수치는 system_setting 'qa_free_quota' (JSON {premiumWeekly, defaultWeekly}) — 마이그레이션 불요.
ALTER TABLE qna_post ADD COLUMN IF NOT EXISTS free_used boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_qna_post_free_week ON qna_post (student_id, created_at) WHERE free_used;
