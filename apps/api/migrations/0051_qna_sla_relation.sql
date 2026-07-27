-- Q1 (SLA·관계 루프) — Q&A 타임스탬프 4점 + 소프트 블록.
-- 실행계획서 W5 · Q&A 코드감사 우선순위 1(소급 불가라 최우선).

ALTER TABLE qna_post
  ADD COLUMN IF NOT EXISTS claimed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS first_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at    timestamptz,
  ADD COLUMN IF NOT EXISTS rating         smallint,
  ADD COLUMN IF NOT EXISTS continue_pref  boolean;

CREATE TABLE IF NOT EXISTS qna_relation_block (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qna_relation_block_uq UNIQUE (student_id, teacher_id)
);
CREATE INDEX IF NOT EXISTS idx_qna_block_teacher ON qna_relation_block (teacher_id);
