-- 채팅 고도화: 답장(인용) + 이모지 반응
ALTER TABLE chat_message ADD COLUMN IF NOT EXISTS reply_to_id uuid;
ALTER TABLE chat_message ADD COLUMN IF NOT EXISTS reactions jsonb NOT NULL DEFAULT '{}'::jsonb;
