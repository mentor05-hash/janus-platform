-- =====================================================================
-- 0009 — notification.recipient_id ON DELETE CASCADE
-- 알림을 여러 도메인 이벤트에 연결하면서, 계정 삭제 시 해당 계정의 알림도
-- 함께 정리되도록 FK 를 CASCADE 로 변경(고아 알림·삭제 차단 방지).
-- =====================================================================

ALTER TABLE notification DROP CONSTRAINT IF EXISTS notification_recipient_id_fkey;
ALTER TABLE notification
  ADD CONSTRAINT notification_recipient_id_fkey
  FOREIGN KEY (recipient_id) REFERENCES account(id) ON DELETE CASCADE;
