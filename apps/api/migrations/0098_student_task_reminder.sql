-- 할 일 마감 리마인더 — 오프셋(d1/d0)별 1회 발송 기록.
ALTER TABLE student_task ADD COLUMN IF NOT EXISTS reminded text[] NOT NULL DEFAULT '{}';
