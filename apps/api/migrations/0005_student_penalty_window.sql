-- =====================================================================
-- 0005 — student_profile 가중 제한 보강 (§5-7, b4)
-- same_day_cancel_count: 당일취소 누적(제한 임계 cancel_threshold 판정에 사용).
-- penalty_since: 마지막 오펜스 시각 → restrict_minutes 시간 기반 자동 해제 기준.
-- =====================================================================

ALTER TABLE student_profile
  ADD COLUMN IF NOT EXISTS same_day_cancel_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_since TIMESTAMPTZ;
