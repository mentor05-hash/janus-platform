-- 실시간 룸 서비스 스키마 — 호스트 앱(예약 등)과 절연된 독립 저장소.
-- 별도 DB 로 배포 가능. 로컬 데모는 같은 postgres 의 'rooms' 스키마에 격리.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS rooms;

-- 룸: 호스트가 프로비저닝. opens_at/closes_at 이 둘 다 있으면 시간창 제한(강제 종료), null 이면 무제한.
CREATE TABLE IF NOT EXISTS rooms.room (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_ref text,                                              -- 호스트 앱의 참조 id(예: bookingId) — 상관관계용
  features     jsonb NOT NULL DEFAULT '{"chat":true,"whiteboard":true,"voice":true}'::jsonb,
  opens_at     timestamptz,                                       -- null = 상시 개방
  closes_at    timestamptz,
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms.room_participant (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      uuid NOT NULL REFERENCES rooms.room(id) ON DELETE CASCADE,
  ext_user_id  text,                                              -- 호스트 앱의 사용자 id
  display_name text,
  role         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_participant_room ON rooms.room_participant(room_id);

CREATE TABLE IF NOT EXISTS rooms.room_message (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     uuid NOT NULL REFERENCES rooms.room(id) ON DELETE CASCADE,
  sender_id   uuid REFERENCES rooms.room_participant(id) ON DELETE SET NULL,
  kind        text NOT NULL DEFAULT 'text',                       -- text | image | file
  body        text,
  file_url    text,                                               -- 첨부(호스트 제공 URL 또는 서비스 스토리지)
  reply_to_id uuid,
  reactions   jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_message_room ON rooms.room_message(room_id, created_at);

CREATE TABLE IF NOT EXISTS rooms.room_snapshot (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id        uuid NOT NULL REFERENCES rooms.room(id) ON DELETE CASCADE,
  strokes        jsonb NOT NULL DEFAULT '[]'::jsonb,
  background_url text,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_snapshot_room ON rooms.room_snapshot(room_id, created_at DESC);
