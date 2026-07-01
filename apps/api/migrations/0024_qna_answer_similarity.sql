-- 답변 유사도(표절·중복 답변) AI 1차 검사 결과 보존.
ALTER TABLE qna_answer ADD COLUMN IF NOT EXISTS similarity numeric(3,2);
ALTER TABLE qna_answer ADD COLUMN IF NOT EXISTS similar_to_id uuid;
ALTER TABLE qna_answer ADD COLUMN IF NOT EXISTS sim_flagged boolean NOT NULL DEFAULT false;
