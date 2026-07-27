-- C2(큐브 벤치마크): 답변 후속 문답 — 같은 선생님에게 이어 묻기(추가 과금 없음).
-- 학생 후속 질문 한도는 system_setting 'qa_followup_limit' (기본 2, 답변당) — 마이그레이션 불요.
CREATE TABLE IF NOT EXISTS qna_followup (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id  uuid NOT NULL REFERENCES qna_answer(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qna_followup_answer ON qna_followup (answer_id, created_at);
