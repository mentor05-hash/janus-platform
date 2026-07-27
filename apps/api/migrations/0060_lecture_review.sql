-- 강좌 후기·평점 — 수강생(진도 있는)만. 강좌별 학생 1회.
CREATE TABLE IF NOT EXISTS lecture_review (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_id uuid NOT NULL REFERENCES lecture(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  rating     smallint NOT NULL,   -- 1~5
  text       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lecture_review_uq UNIQUE (lecture_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_lec_review_lec ON lecture_review (lecture_id);
