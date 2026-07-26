-- =====================================================================
-- 0105 — guardian_link_event (보호자-학생 연결 상태 이력 · O124)
-- guardian_student_link 는 @@unique(guardian_id, student_id) 라 재연결이
-- 새 행이 아니라 기존 행 update 로만 가능하다. 그대로 두면 거절·해제 이력이
-- 덮여 사라지므로 전이를 append-only 로 남긴다.
-- 재신청 쿨다운·횟수 제한의 판정 근거도 이 테이블이다.
-- actor_id 는 audit_log 와 같이 FK 없이 둔다(계정 삭제 후에도 이력 보존).
-- =====================================================================
CREATE TABLE IF NOT EXISTS guardian_link_event (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id     uuid NOT NULL REFERENCES guardian_student_link(id) ON DELETE CASCADE,
  from_status text,                                   -- 최초 신청은 NULL
  to_status   text NOT NULL,
  actor_id    uuid,                                   -- 전이를 일으킨 계정
  actor_role  text,                                   -- guardian · student · admin · hr
  reason      text,                                   -- relink · admin_override 등
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guardian_link_event_to_chk
    CHECK (to_status IN ('pending','approved','rejected','revoked')),
  CONSTRAINT guardian_link_event_from_chk
    CHECK (from_status IS NULL OR from_status IN ('pending','approved','rejected','revoked'))
);
CREATE INDEX IF NOT EXISTS idx_guardian_link_event_link
  ON guardian_link_event (link_id, created_at DESC);
