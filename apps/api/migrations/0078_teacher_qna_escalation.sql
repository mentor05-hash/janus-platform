-- 선생님 "Q&A 후 이어서 상담" 제공 여부(옵트아웃 가능). 기본 제공(true).
ALTER TABLE teacher_profile ADD COLUMN IF NOT EXISTS qna_escalation boolean NOT NULL DEFAULT true;
