-- =====================================================================
-- 0012 — 회원 분류(member_type) — 선생님·학생 유형(확장 가능, §people)
-- 선생님: 전임/파트/대학생멘토/입시컨설턴트/외부 등(이후 추가 가능)
-- 학생:   재원생/외부학생 등(이후 추가 가능)
-- =====================================================================

CREATE TABLE IF NOT EXISTS member_type (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       TEXT NOT NULL,                 -- 'teacher' | 'student'
  code       TEXT NOT NULL,
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, code)
);

ALTER TABLE teacher_profile ADD COLUMN IF NOT EXISTS type_code TEXT;
ALTER TABLE student_profile ADD COLUMN IF NOT EXISTS type_code TEXT;

-- 초기 분류값(확장 가능)
INSERT INTO member_type (kind, code, label, sort_order) VALUES
  ('teacher','fulltime','전임선생님',1),
  ('teacher','parttime','파트선생님',2),
  ('teacher','mentor','대학생 멘토',3),
  ('teacher','consultant','입시컨설턴트',4),
  ('teacher','external','외부선생님',5),
  ('student','enrolled','학원 재원생',1),
  ('student','external','외부학생',2)
ON CONFLICT (kind, code) DO NOTHING;
