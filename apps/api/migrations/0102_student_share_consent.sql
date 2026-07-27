-- =====================================================================
-- 학생 본인의 '보호자 공유 동의' 원장 — **성인 학생**의 데이터를 보호자가 열람하려면 필요.
--
-- 연령별 권한 분기(O105):
--   · 미성년(user_consent.is_minor=true) → 보호자 권한. 기존 guardian_data_consent(0085)
--     의 본인확인(verified) + 전달동의(consent_delivery) 를 게이트로 쓴다. 이 표는 불필요.
--   · 성인(is_minor=false 또는 기록 없음) → **학생 본인 동의가 없으면 열람 불가**(기본 deny).
--     is_minor 기록이 없으면 성인으로 간주 = 더 보수적인 쪽(동의 필요)으로 판정한다.
--
-- 기존 consent_grant 를 쓰지 않은 이유: UNIQUE(student_id, kind) 라 보호자가 둘 이상일 때
--   보호자별 개별 동의·철회를 표현할 수 없다. 여기서는 (학생, 보호자, 범위) 단위로 관리한다.
-- 철회는 revoked_at 으로 즉시 반영(행 삭제 안 함 — 동의·철회 이력을 남긴다).
-- =====================================================================
CREATE TABLE IF NOT EXISTS student_share_consent (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  guardian_id    uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  scope          text NOT NULL DEFAULT 'report',   -- report(산출물 이력) | 확장 여지(추가만)
  policy_version text NOT NULL DEFAULT 'v1',
  granted_at     timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE student_share_consent DROP CONSTRAINT IF EXISTS student_share_consent_scope_chk;
ALTER TABLE student_share_consent ADD CONSTRAINT student_share_consent_scope_chk
  CHECK (scope IN ('report'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_share_consent
  ON student_share_consent(student_id, guardian_id, scope);
CREATE INDEX IF NOT EXISTS idx_student_share_consent_student
  ON student_share_consent(student_id, scope);
