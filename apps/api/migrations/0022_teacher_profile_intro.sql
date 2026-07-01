-- 0022: 선생님 강점·특기·소개(자기 프로필). 니즈 기반 추천·상세 노출용.
ALTER TABLE teacher_profile ADD COLUMN IF NOT EXISTS intro text;
ALTER TABLE teacher_profile ADD COLUMN IF NOT EXISTS strengths text[] NOT NULL DEFAULT '{}';
