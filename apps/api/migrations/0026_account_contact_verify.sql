-- 계정 보안: 이메일·휴대폰(선택) + 인증 상태. 인증코드/재설정 토큰은 Redis(TTL)로 관리.
ALTER TABLE account ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE account ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE account ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE account ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false;
