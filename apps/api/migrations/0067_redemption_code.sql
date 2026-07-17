-- 0067 — 리뎀션 코드(수강권). 센터 오프라인 판매·프로모용: 코드 발급 → 사용자 등록 → 상품 권한 부여.
-- PG 연동(N23~25) 전 실매출 경로. 사용 시 entitlement.grant(source='redemption') 호출.
CREATE TABLE IF NOT EXISTS redemption_code (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text UNIQUE NOT NULL,                    -- 사람이 읽는 코드(JANUS-XXXX-XXXX)
  product_key      text NOT NULL,                           -- 부여 상품(full·jeongsi·kairos·kairos-alea)
  grant_expires_at timestamptz,                             -- 등록 시 부여할 권한 만료(NULL=무기한). 일회성 기간제=수능시즌 말.
  valid_until      timestamptz,                             -- 코드 사용 가능 기한(NULL=무제한)
  redeemed_by      uuid REFERENCES account(id) ON DELETE SET NULL,
  redeemed_at      timestamptz,
  note             text,                                    -- 발급 배치·판매처 메모
  created_by       uuid REFERENCES account(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS redemption_code_product_idx ON redemption_code (product_key);
CREATE INDEX IF NOT EXISTS redemption_code_redeemed_idx ON redemption_code (redeemed_by);
