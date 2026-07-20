-- F3 선생님 Q&A 수신 설정 — 질문 수신 on/off + 수신 과목 제한(빈 배열 = 전체).
ALTER TABLE teacher_profile ADD COLUMN IF NOT EXISTS qna_receive boolean NOT NULL DEFAULT true;
ALTER TABLE teacher_profile ADD COLUMN IF NOT EXISTS qna_subjects text[] NOT NULL DEFAULT '{}';
