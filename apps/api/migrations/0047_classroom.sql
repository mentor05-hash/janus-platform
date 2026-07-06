-- =====================================================================
-- 0047 — classroom (온라인 강의실 · 1:다 화이트보드 강의)
-- 선생님이 강의(class_session)를 개설하면 룸 서비스에 lecture 룸이 생기고,
-- 학생(class_enrollment)이 입장 시 룸 참가자(viewer)로 동적 등록된다.
-- 실시간 판서/역할 게이팅은 룸 서비스(mode=lecture)가 담당(0046 이후 rooms).
-- =====================================================================
CREATE TABLE IF NOT EXISTS class_session (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id          uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  title               text NOT NULL,
  subject             text,
  scheduled_at        timestamptz,
  duration_min        integer,
  capacity            integer NOT NULL DEFAULT 100,
  room_id             uuid,                                   -- 룸 서비스 roomId
  host_participant_id uuid,                                   -- 룸 서비스 host 참가자
  status              text NOT NULL DEFAULT 'scheduled',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_session_status_chk CHECK (status IN ('scheduled','live','ended','canceled'))
);
CREATE INDEX IF NOT EXISTS idx_class_session_teacher ON class_session(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_session_status ON class_session(status);

CREATE TABLE IF NOT EXISTS class_enrollment (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_session_id uuid NOT NULL REFERENCES class_session(id) ON DELETE CASCADE,
  student_id       uuid REFERENCES account(id) ON DELETE SET NULL,
  role             text NOT NULL DEFAULT 'viewer',           -- viewer·presenter(위임)
  participant_id   uuid,                                     -- 룸 참가자(입장 시 지연 발급)
  joined_at        timestamptz,
  left_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_enrollment_uq UNIQUE (class_session_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_class_enrollment_class ON class_enrollment(class_session_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollment_student ON class_enrollment(student_id);
