-- 학생 목표(대학 라인/평균) — 성적 추이에서 목표 대비 격차 표시.
ALTER TABLE student_profile ADD COLUMN IF NOT EXISTS goal_tier text;
ALTER TABLE student_profile ADD COLUMN IF NOT EXISTS goal_avg integer;
