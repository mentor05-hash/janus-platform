-- 0039: 채팅 읽음 확인 — read_at 추가(수신자가 읽은 시각). 미확인(unread) 카운트·읽음 표시용.
ALTER TABLE chat_message ADD COLUMN IF NOT EXISTS read_at timestamptz;
-- 미확인 조회 최적화(수신자 기준 읽지 않은 메시지)
CREATE INDEX IF NOT EXISTS idx_chat_unread ON chat_message (booking_id, sender_id) WHERE read_at IS NULL;
