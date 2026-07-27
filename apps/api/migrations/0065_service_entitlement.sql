-- 0065 — 상품 권한(entitlement) 기반. 결정(2026-07-16):
--   ① 상품 형태 = 일회성 기간제(수능시즌만) — expires_at 로 만료 관리(NULL=무기한, 예외적).
--   ② 상품 분리 = 전체 배치표(full)/정시 정밀배치표(jeongsi)/카이로스 단독(kairos)/카이로스+알레아 묶음(kairos-alea).
--   ③ 비회원 = 가입 시 role student(member 티어). 유료는 role 승격이 아니라 이 테이블의 권한 행으로 부여.
--   ④ 가격/노출 = N23~N25 연동(미확정). 결제 훅은 후속 — 지금은 grant() 를 관리자 수동/결제 콜백이 호출.
-- 권한 그레인 = service_id(sso_service.id 또는 배치표 유사서비스). 만료·환불은 expires_at·revoked_at 로.
CREATE TABLE IF NOT EXISTS service_entitlement (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  service_id  text NOT NULL,                          -- 해제 대상(kairos·alea·baechipyo-full·baechipyo-jeongsi)
  product_key text,                                   -- 구매 상품(full·jeongsi·kairos·kairos-alea) — 감사/환불 추적
  source      text NOT NULL DEFAULT 'admin',          -- admin | payment | promo
  granted_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,                            -- NULL=무기한 · 일회성 기간제는 값 지정(수능시즌 종료)
  note        text,
  created_by  uuid REFERENCES account(id) ON DELETE SET NULL,
  revoked_at  timestamptz                             -- 환불·취소 소프트 삭제(활성 판정에서 제외)
);
CREATE INDEX IF NOT EXISTS service_entitlement_account_idx ON service_entitlement (account_id);
CREATE INDEX IF NOT EXISTS service_entitlement_lookup_idx ON service_entitlement (account_id, service_id);

-- 유료 배치표 서비스 2종 등록(기존 member 티어 'baechipyo'=외부 사이트 SSO 와 분리).
--   baechipyo-full   = 허브 내 전체 유료 배치표 해제
--   baechipyo-jeongsi= 정시(kind=jeongsi) 유료 배치표 해제
INSERT INTO sso_service (id, name, allowed_scopes, min_tier)
VALUES ('baechipyo-full', '야누스 전체 배치표', '["view"]', 'paid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sso_service (id, name, allowed_scopes, min_tier)
VALUES ('baechipyo-jeongsi', '야누스 정시 정밀배치표', '["view"]', 'paid')
ON CONFLICT (id) DO NOTHING;
