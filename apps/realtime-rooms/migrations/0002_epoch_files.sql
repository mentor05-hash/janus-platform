-- 토큰 폐기(revocation): 룸 토큰 epoch. revoke 시 증가시켜 기존 토큰 일괄 무효화.
ALTER TABLE rooms.room ADD COLUMN IF NOT EXISTS token_epoch int NOT NULL DEFAULT 0;

-- 첨부 자체 스토리지: 룸 소유 파일. storage_path 는 로컬 디스크 또는 외부 스토리지 키.
CREATE TABLE IF NOT EXISTS rooms.room_file (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      uuid NOT NULL REFERENCES rooms.room(id) ON DELETE CASCADE,
  uploader_id  uuid,
  filename     text NOT NULL,
  mime         text,
  size         int,
  storage_path text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_file_room ON rooms.room_file(room_id);
