-- 선생님이 제공하는 상담 유형(담임/교과/입시/심리) 태깅 — 검색 '상담 유형' 필터용.
ALTER TABLE teacher_profile ADD COLUMN IF NOT EXISTS consult_types text[] NOT NULL DEFAULT '{}';
