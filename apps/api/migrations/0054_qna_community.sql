-- Q3 커뮤니티 v1(3부 공개 게시판) — 무료·전원 답변(학생 포함)·무정산·신고/숨김.
-- 유료 Q&A(qna_answer, 교사 전용)와 분리: 커뮤니티 답변은 별도 테이블(작성자=임의 계정).

ALTER TABLE qna_post
  ADD COLUMN IF NOT EXISTS community    boolean NOT NULL DEFAULT false, -- 커뮤니티(무료) 질문
  ADD COLUMN IF NOT EXISTS hidden       boolean NOT NULL DEFAULT false, -- 신고 누적/모더레이션 숨김
  ADD COLUMN IF NOT EXISTS report_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS qna_community_answer (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      uuid NOT NULL,
  author_id    uuid NOT NULL,               -- 임의 계정(학생·교사 모두 가능)
  body         text,
  accepted     boolean NOT NULL DEFAULT false,
  hidden       boolean NOT NULL DEFAULT false,
  report_count integer NOT NULL DEFAULT 0,
  similarity   numeric(3,2),                -- AI 초안과의 유사도(미표기 감지)
  ai_similar   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comm_ans_post   ON qna_community_answer (post_id);
CREATE INDEX IF NOT EXISTS idx_comm_ans_author ON qna_community_answer (author_id);

CREATE TABLE IF NOT EXISTS qna_report (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL,                -- 'post' | 'answer'
  target_id   uuid NOT NULL,
  reporter_id uuid NOT NULL,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qna_report_uq UNIQUE (target_type, target_id, reporter_id)
);
