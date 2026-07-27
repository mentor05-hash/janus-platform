-- C1 직거래·연락처 감지 기록(API audit_log 동형 — 룸 서비스 독립 DB용). 차단 없음, 신호 기록만.
CREATE TABLE IF NOT EXISTS rooms.room_moderation_flag (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid NOT NULL,
  sender_id   uuid NOT NULL,
  kinds       text[] NOT NULL,
  excerpt     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_room_moderation_flag_room ON rooms.room_moderation_flag (room_id);
