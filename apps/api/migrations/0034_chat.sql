-- 실시간 1:1 채팅 상담(예약 기반). 화이트보드는 별도 스냅샷(선택).
CREATE TABLE IF NOT EXISTS chat_message (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    uuid NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
  sender_id     uuid,
  kind          text NOT NULL DEFAULT 'text',   -- text | image | system
  body          text,
  image_file_id uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_message_booking ON chat_message (booking_id, created_at);

-- 화이트보드 스냅샷(선택 저장)
CREATE TABLE IF NOT EXISTS whiteboard_snapshot (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
  strokes    jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whiteboard_booking ON whiteboard_snapshot (booking_id, created_at);
