-- 야누스 N33 축 B(능력·설명방식 오각형) — 답변 수령자의 재평가.
-- answer_rating: 답변을 받은 질문자가 답변자의 "설명방식"을 축별로 평가한 값(자기신고 아님·수령자 평가).
--   축(axis): 정확·친절·논리·속도·눈높이. score 1~5. 답변·평가자·축 조합은 1건(재평가 시 갱신).
--   설명방식 오각형의 유일한 데이터 원천. 노출 게이트(표본 n≥5)는 집계 시 적용(N33).
CREATE TABLE IF NOT EXISTS answer_rating (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id  uuid NOT NULL REFERENCES qna_community_answer(id) ON DELETE CASCADE,
  rater_id   uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  axis       text NOT NULL CHECK (axis IN ('accuracy','kindness','logic','speed','level')),
  score      smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS answer_rating_ans_rater_axis_uq ON answer_rating (answer_id, rater_id, axis);
CREATE INDEX IF NOT EXISTS answer_rating_answer_idx ON answer_rating (answer_id);
