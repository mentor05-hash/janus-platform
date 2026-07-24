-- weekly_credit_grant 인덱스 — 크레딧 소비 핫패스·만료 배치.
-- 근거: consumeWithin(credit.service.ts) where account_id + remaining>0 order by expire_at asc → 매 차감마다 스캔.
--       runExpire/runGrant(weekly-grant.service.ts) where remaining>0 and expire_at<=now → 전역 스캔.
CREATE INDEX IF NOT EXISTS idx_wcg_account_expire ON weekly_credit_grant(account_id, expire_at);
CREATE INDEX IF NOT EXISTS idx_wcg_expire ON weekly_credit_grant(expire_at);
