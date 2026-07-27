-- Q3 리그 v1 — 커뮤니티 답변 실적(채택수·채택률) 기반 답변자 등급(3부 기본 → 2부 → 1부).
-- 승급 임계값은 system_setting['qna_league_policy'](JSON)로 조정(N27 확정 전 코드 기본값).
-- tier: 3=입문(기본), 2=정예, 1=마스터. 낮을수록 상위.

CREATE TABLE IF NOT EXISTS qna_league (
  account_id   uuid PRIMARY KEY,
  tier         smallint NOT NULL DEFAULT 3,   -- 3(기본)/2/1
  authored     integer  NOT NULL DEFAULT 0,   -- 스냅샷: 답변 수(숨김 제외)
  accepted     integer  NOT NULL DEFAULT 0,   -- 채택 수
  accept_rate  integer  NOT NULL DEFAULT 0,   -- 채택률(%)
  promoted_at  timestamptz,                   -- 마지막 승급 시각(하락은 기록만)
  evaluated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qna_league_tier ON qna_league (tier, accepted DESC);
