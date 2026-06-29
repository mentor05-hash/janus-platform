-- =====================================================================
-- 0007 — booking.meeting_url (§9·§10 ZoomProvider, a2)
-- zoom 예약 확정 시 ZoomProvider 가 발급한 입장 URL 보존.
-- =====================================================================

ALTER TABLE booking
  ADD COLUMN IF NOT EXISTS meeting_url TEXT;
