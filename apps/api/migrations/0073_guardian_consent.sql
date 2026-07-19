-- 본부 결정(2026-07-19): 미성년 음성의 외부 STT 전송은 "보호자 동의된 학생"에 한해 가능.
-- 학생 단위 상시 동의 원장(철회 가능) — 세션마다 묻지 않고, 녹음 시작 시 consult_recording 에 스탬프.
-- kind 확장 가능(recording_stt 외 향후 동의 항목) — 기존 테이블 무변경 원칙(브리핑 §6).
CREATE TABLE IF NOT EXISTS consent_grant (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL,
  guardian_id    uuid NOT NULL,
  kind           text NOT NULL DEFAULT 'recording_stt',
  policy_version text NOT NULL DEFAULT 'v1',
  granted_at     timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,
  UNIQUE (student_id, kind)
);
