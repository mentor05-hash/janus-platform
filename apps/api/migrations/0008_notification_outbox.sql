-- =====================================================================
-- 0008 — notification 전달 추적/재시도 (§10, a4)
-- delivery: 채널별 전달 상태 {app:sent, sms:failed, ...}.
-- attempts/last_attempt_at: outbox 재시도 제어.
-- =====================================================================

ALTER TABLE notification
  ADD COLUMN IF NOT EXISTS delivery JSONB,
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
