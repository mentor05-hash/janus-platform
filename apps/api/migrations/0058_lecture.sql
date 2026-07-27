-- 강좌 v1 — 강좌 카탈로그 + 수강신청. 데모 강좌(합성)로 실동작, 실강좌는 후속 교사 등록.
CREATE TABLE IF NOT EXISTS lecture (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid,                          -- 등록 교사(데모는 null 허용)
  subject    text NOT NULL,                 -- 국어·수학·영어…
  unit       text,                          -- 유형(선택)
  title      text NOT NULL,
  summary    text,
  level      text,                          -- 입문·기본·심화
  minutes    integer,                       -- 총 강의 시간(분)
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lecture_subject ON lecture (subject) WHERE active;

CREATE TABLE IF NOT EXISTS lecture_enrollment (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_id uuid NOT NULL REFERENCES lecture(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lecture_enrollment_uq UNIQUE (lecture_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_lec_enr_student ON lecture_enrollment (student_id);

-- ── 데모(합성) 강좌 ─────────────────────────────────────────────────────
INSERT INTO lecture (id, subject, unit, title, summary, level, minutes) VALUES
 ('b0000000-0000-4000-8000-000000000001','수학','미적분','미적분 개념 완성','순간변화율·도함수 직관부터 합성함수 미분까지 핵심만.','기본',95),
 ('b0000000-0000-4000-8000-000000000002','수학','확률과통계','확통 빈출 유형 12','조건부확률·이항분포 빈출 유형 집중 훈련.','심화',80),
 ('b0000000-0000-4000-8000-000000000003','국어','독서','독서 지문 구조 독해','설명문·논설문 구조를 표시하며 주장·근거 빠르게 잡기.','기본',70),
 ('b0000000-0000-4000-8000-000000000004','국어','문학','문학 정서·태도 30제','시·소설 화자의 정서와 태도 판단 반복.','기본',60),
 ('b0000000-0000-4000-8000-000000000005','영어','독해','영어 주제문 잡기','글의 topic sentence로 주제 빠르게 파악하는 법.','입문',50)
ON CONFLICT (id) DO NOTHING;
