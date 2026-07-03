-- 전임 강제 배정: 자동배정 대기열(학생이 시간 미지정으로 자동 배정 신청)
-- 배치가 전임 근무시간 빈 슬롯에 배정하며 status 를 assigned 로 전이.
CREATE TABLE IF NOT EXISTS auto_assign_request (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  center_id           uuid,
  consult_type        consult_type NOT NULL,
  sub_type            text,
  mode                text NOT NULL DEFAULT 'zoom',   -- 선호 방식(zoom/chat/hand/offline)
  status              text NOT NULL DEFAULT 'waiting', -- waiting | assigned | cancelled
  assigned_booking_id uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  assigned_at         timestamptz
);
-- 대기 조회(오래된 순 배정) + 학생별 중복 방지 보조
CREATE INDEX IF NOT EXISTS idx_auto_assign_waiting ON auto_assign_request (status, created_at);
CREATE INDEX IF NOT EXISTS idx_auto_assign_student ON auto_assign_request (student_id, status);
