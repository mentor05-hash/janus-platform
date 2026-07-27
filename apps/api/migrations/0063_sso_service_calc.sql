-- 0063 — 계산기 SSO 레지스트리 시드(카이로스·알레아 · 접합계약 C2)
-- 계산기(카이로스 v2·알레아)는 자체완결 코드(저작권 데이터 0)로 repo(public/calc)에 편입.
-- janus_sso.services 에 아래 id 포함 시 계산기가 잠금 해제(data-tier=paid) — 없으면 free 티저(블러).
-- min_tier = 진입/해제 최소 티어. 결정 대기(인계명세 §6 유료 경계): 데모 위해 기본 'member',
--   유료 티어 도입 시 'paid' 로 상향하면 회원=티저·유료=전체로 전환(코드 무변경, 행 1개 값).
INSERT INTO sso_service (id, name, allowed_scopes, min_tier)
VALUES ('kairos', '야누스 카이로스(정시 지원분석)', '["view"]', 'member')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sso_service (id, name, allowed_scopes, min_tier)
VALUES ('alea', '야누스 알레아(이벤트 확률)', '["view"]', 'member')
ON CONFLICT (id) DO NOTHING;
