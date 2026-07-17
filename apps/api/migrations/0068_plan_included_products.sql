-- 0068 — 구독 플랜 번들: 플랜에 포함된 상품(배치표 등)을 구독 시 자동 부여(O74 #3).
-- included_products = 상품 키 배열(full·jeongsi·kairos·kairos-alea). 구독 개시 시 entitlement(source=subscription) 부여.
ALTER TABLE subscription_plan ADD COLUMN IF NOT EXISTS included_products jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 데모: VIP 플랜(시드 고정 id)에 전체 배치표 포함. 없으면 무시.
UPDATE subscription_plan SET included_products = '["full"]'::jsonb
 WHERE id = '00000000-0000-4000-8000-0000000000b4' AND included_products = '[]'::jsonb;
