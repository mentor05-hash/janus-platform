-- =====================================================================
-- 맞춤 할 일(체크리스트) — 격차(약점 과목)·학사일정에서 자동 제안 + 수동 추가.
-- 진단(격차 리포트) → 실행(할 일) 루프 연결. 자동 제안은 source_key 로 멱등.
-- status: todo(할일) | done(완료) | dismissed(숨김-재생성 방지 톰스톤)
-- =====================================================================
CREATE TABLE IF NOT EXISTS student_task (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL,
  title       text NOT NULL,
  category    text NOT NULL DEFAULT 'custom',  -- gap | academic | consult | qna | custom | plan(예약: planner 학습량 원장 렌더용, O100 D1)
  subject     text,
  due_date    date,
  status      text NOT NULL DEFAULT 'todo',
  source_key  text,                            -- 자동생성 dedup(gap:<subject>, aca:<eventId>). 수동=null
  cta_href    text,                            -- 실행 링크
  created_by  text NOT NULL DEFAULT 'self',    -- auto | self
  created_at  timestamptz NOT NULL DEFAULT now(),
  done_at     timestamptz
);

ALTER TABLE student_task DROP CONSTRAINT IF EXISTS student_task_status_chk;
ALTER TABLE student_task ADD CONSTRAINT student_task_status_chk
  CHECK (status IN ('todo', 'done', 'dismissed'));

-- 자동 제안 멱등: 학생당 source_key 1회. (수동 task 는 source_key NULL → 제약 무관)
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_task_source
  ON student_task(student_id, source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_task_student ON student_task(student_id, status);
