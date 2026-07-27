-- =====================================================================
-- 학사일정(월별 중요일정) — 수능·모의고사·신청기간·내신·학사 등 학사정보.
-- center_id NULL = 전국 공통(본사 관리, 예: 수능·교육청 모의고사),
--           값  = 센터 자체 일정(예: 센터 내신대비특강·자체시험).
-- 조회: 로그인 사용자 전원(학생·학부모·선생님). center_id IS NULL OR = 본인 센터.
-- =====================================================================
CREATE TABLE IF NOT EXISTS academic_event (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id   uuid REFERENCES center(id) ON DELETE CASCADE,
  title       text NOT NULL,
  type        text NOT NULL DEFAULT 'etc',
  start_date  date NOT NULL,
  end_date    date,               -- NULL=단일일, 값=기간(신청기간 등)
  grade       text,               -- 대상 학년(고1/고2/고3/전체) — 선택
  description text,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE academic_event DROP CONSTRAINT IF EXISTS academic_event_type_chk;
ALTER TABLE academic_event ADD CONSTRAINT academic_event_type_chk
  CHECK (type IN ('exam','mock','mock_apply','suneung','admission','school','etc'));

CREATE INDEX IF NOT EXISTS idx_academic_event_date   ON academic_event(start_date);
CREATE INDEX IF NOT EXISTS idx_academic_event_center ON academic_event(center_id, start_date);
