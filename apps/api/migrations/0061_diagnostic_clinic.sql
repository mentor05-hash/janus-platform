-- 약점 클리닉 별도 추적 — 클리닉 시도 플래그 + 원본 진단 연결(추이·반복훈련 분석).
ALTER TABLE diagnostic_attempt ADD COLUMN IF NOT EXISTS is_clinic boolean NOT NULL DEFAULT false;
ALTER TABLE diagnostic_attempt ADD COLUMN IF NOT EXISTS parent_attempt_id uuid;

-- 기존 클리닉 시도(subject='약점클리닉') 소급 표시.
UPDATE diagnostic_attempt SET is_clinic = true WHERE subject = '약점클리닉' AND is_clinic = false;

CREATE INDEX IF NOT EXISTS idx_diag_attempt_clinic ON diagnostic_attempt (student_id, is_clinic, started_at DESC);
