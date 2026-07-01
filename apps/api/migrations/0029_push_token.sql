-- 푸시 토큰(expo-notifications) 등록 — 기기별 다중 토큰. mock 푸시 발송 대상.
CREATE TABLE IF NOT EXISTS push_token (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  token        text NOT NULL UNIQUE,
  platform     text,               -- ios | android | web
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_token_account ON push_token (account_id);
