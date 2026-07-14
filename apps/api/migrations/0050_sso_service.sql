-- =====================================================================
-- 0050 — sso_service (크로스서비스 SSO 레지스트리 · O42·W3)
-- 플랫폼 로그인 1회 → 연계 서비스(배치표 baechipyo 등) 재로그인 없이 진입.
-- 서비스 추가 = 행 1개(코드 무변경). epoch 증가 = 해당 서비스 토큰 일괄 폐기.
-- prisma model sso_service 와 일치.
-- =====================================================================
CREATE TABLE IF NOT EXISTS sso_service (
  id               text PRIMARY KEY,                       -- aud 값(예: baechipyo)
  name             text NOT NULL,
  allowed_scopes   jsonb NOT NULL DEFAULT '["view"]',      -- 발급 가능 scope 상한
  min_tier         text NOT NULL DEFAULT 'member',         -- 진입 최소 티어(free|member|paid|consultant)
  epoch            integer NOT NULL DEFAULT 1,             -- 일괄 폐기 카운터
  redirect_origins jsonb NOT NULL DEFAULT '[]',            -- 토큰 전달 허용 origin(오픈 리다이렉트 방지)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 배치표 서비스 시드(접합계약 C2 — 서비스 id 'baechipyo'). 이미 있으면 유지.
INSERT INTO sso_service (id, name, allowed_scopes, min_tier)
VALUES ('baechipyo', '야누스 배치표', '["view","ingest-score"]', 'member')
ON CONFLICT (id) DO NOTHING;
