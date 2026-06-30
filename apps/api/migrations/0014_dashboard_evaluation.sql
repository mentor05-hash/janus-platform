-- 0014 — 대시보드 추가 요구(설계 반영): 평가 가중치 정책·월별 시수·원장 플래그
-- 권한/집계 로직은 후속 단계(가드·엔진)에서 구현. 본 마이그레이션은 스키마(계약)만.

-- ① 평가 가중치 정책 (다지표, 합계 100). center_id NULL = 전사 기본.
CREATE TABLE IF NOT EXISTS evaluation_weight_policy (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id      UUID REFERENCES center(id) ON DELETE CASCADE,   -- NULL=전사
  w_total        SMALLINT NOT NULL DEFAULT 20,  -- 누적 상담
  w_completion   SMALLINT NOT NULL DEFAULT 20,  -- 완료율
  w_rerequest    SMALLINT NOT NULL DEFAULT 15,  -- 재요청률(전환)
  w_reject       SMALLINT NOT NULL DEFAULT 10,  -- 거부율(역지표)
  w_noshow       SMALLINT NOT NULL DEFAULT 10,  -- 노쇼율(역지표)
  w_response     SMALLINT NOT NULL DEFAULT 10,  -- 평균 응답(역지표)
  w_satisfaction SMALLINT NOT NULL DEFAULT 15,  -- 만족도
  updated_by     UUID,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT weight_sum_100 CHECK (w_total+w_completion+w_rerequest+w_reject+w_noshow+w_response+w_satisfaction = 100)
);
-- 전사 1행 + 센터별 1행 보장
CREATE UNIQUE INDEX IF NOT EXISTS uq_weight_global ON evaluation_weight_policy ((center_id IS NULL)) WHERE center_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_weight_center ON evaluation_weight_policy (center_id) WHERE center_id IS NOT NULL;
-- 전사 기본 1행 시드(가중치는 정책 테이블에 저장 — 하드코딩 금지)
INSERT INTO evaluation_weight_policy (center_id) VALUES (NULL)
  ON CONFLICT DO NOTHING;

-- ② 선생님 월별 근무시수 (시간당 지표 환산용)
CREATE TABLE IF NOT EXISTS teacher_monthly_hours (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES teacher_profile(account_id) ON DELETE CASCADE,
  year_month  CHAR(7) NOT NULL,                 -- 'YYYY-MM'
  hours       NUMERIC(6,1) NOT NULL DEFAULT 0,
  updated_by  UUID,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, year_month)
);

-- ③ 원장/부원장 직무 플래그
ALTER TABLE teacher_profile ADD COLUMN IF NOT EXISTS director_role TEXT;  -- '원장'|'부원장'|NULL
