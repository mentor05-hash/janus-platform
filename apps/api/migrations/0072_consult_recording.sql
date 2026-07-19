-- R1(상담 녹음 브리핑): 상담 오디오 녹음 원장 — 동의·egress·보관·파기 추적.
-- 기능 플래그 system_setting 'consult_recording' {enabled:false} 기본 OFF(본부 확정 전).
CREATE TABLE IF NOT EXISTS consult_recording (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id             uuid NOT NULL UNIQUE,
  egress_id              text,
  s3_key                 text,
  duration_sec           int,
  size_bytes             bigint,
  consent_student_at     timestamptz,
  consent_teacher_at     timestamptz,
  consent_policy_version text NOT NULL DEFAULT 'v1',
  consent_guardian_at    timestamptz,           -- 미결 2: 훅만(활성화 본부 소관)
  status                 text NOT NULL DEFAULT 'pending', -- pending|consented|recording|stored|aborted|purged
  expires_at             timestamptz,
  purged_at              timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consult_recording_status ON consult_recording (status, expires_at);
