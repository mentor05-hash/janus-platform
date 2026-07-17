-- 0066 — 상품 권한 만료 임박 알림 멱등성(중복 알림 방지). 알림 발송 시각 기록.
ALTER TABLE service_entitlement ADD COLUMN IF NOT EXISTS expiry_notified_at timestamptz;
