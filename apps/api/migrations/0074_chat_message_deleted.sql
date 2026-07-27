-- 채팅 메시지 삭제(회수) — soft delete. 원문은 DB 보존(직거래 감사·분쟁 대응), 클라이언트 표시만 차단.
ALTER TABLE chat_message ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
