-- 메시지 삭제(회수) — soft delete. 원문 보존(감사·분쟁 대응), 표시만 차단.
ALTER TABLE rooms.room_message ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
