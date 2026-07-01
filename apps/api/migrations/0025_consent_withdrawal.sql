-- 법/개인정보: 이용약관·개인정보 동의 기록 + 미성년 보호자 동의 + 회원 탈퇴.
CREATE TABLE IF NOT EXISTS user_consent (
  account_id        uuid PRIMARY KEY REFERENCES account(id) ON DELETE CASCADE,
  terms_version     text NOT NULL,
  privacy_version   text NOT NULL,
  marketing_agreed  boolean NOT NULL DEFAULT false,
  is_minor          boolean NOT NULL DEFAULT false,
  guardian_name     text,
  guardian_contact  text,
  agreed_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE account ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;
ALTER TABLE account ADD COLUMN IF NOT EXISTS withdrawal_reason text;
