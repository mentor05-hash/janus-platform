-- 야누스 학원찾기(academy finder) v2 — 세션 1: 스키마·공공 적재·provenance.
-- 스펙: docs 학원찾기 구현 스펙 v2 §2. 모든 노출 필드는 출처(provenance) 3등급을 가진다:
--   public(공공 신고자료) / claimed(학원 제공·미검증) / verified(야누스 집계).
-- 프라이버시(§4): 이용자 집 주소·좌표는 서버 저장 금지 — 매칭은 dong_code(행정동) 또는 기기측 반경.
-- 집계 k-익명(n>=5)은 집계 잡에서 강제(DB 제약 아님). 정산·매칭 점수와 무관한 신규 도메인.

-- 1) 학원 본체 --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academy (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ext_key        text,                       -- 공공데이터 원천 식별자(중복 적재 방지 upsert 키)
  name           text NOT NULL,
  addr           text,
  dong_code      text,                       -- 행정동 코드(통학 매칭 v1 질의 단위)
  lat            double precision,
  lng            double precision,
  phone          text,
  biz_reg_masked text,                       -- 사업자등록번호 마스킹본(원본 비저장)
  source         text NOT NULL DEFAULT 'public' CHECK (source IN ('public','claimed')),
  claim_status   text NOT NULL DEFAULT 'none' CHECK (claim_status IN ('none','pending','approved','rejected')),
  nearest_station jsonb,                      -- {name,line,walk_min}
  active         boolean NOT NULL DEFAULT true,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);
-- 일반 유니크 인덱스: Postgres 는 NULL 을 distinct 로 취급해 미클레임(ext_key NULL) 다중 허용,
-- 동시에 upsert(ON CONFLICT ext_key)가 부분 인덱스와 달리 매칭된다.
CREATE UNIQUE INDEX IF NOT EXISTS academy_ext_key_uq ON academy (ext_key);
CREATE INDEX IF NOT EXISTS academy_dong_idx ON academy (dong_code);
CREATE INDEX IF NOT EXISTS academy_name_idx ON academy (name);

-- 2) 반(class) --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academy_class (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id    uuid NOT NULL REFERENCES academy(id) ON DELETE CASCADE,
  subject       text NOT NULL,
  target_grades text[] NOT NULL DEFAULT '{}',  -- 초1~고3·N수
  level         text NOT NULL DEFAULT 'regular' CHECK (level IN ('basic','regular','advanced','prep')),
  schedule      jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{dow,start,end}]
  capacity      integer,
  tuition_krw   integer,                        -- 수강료(원 정수)
  tuition_source text NOT NULL DEFAULT 'declared' CHECK (tuition_source IN ('declared','claimed')),
  entry_test    boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS academy_class_academy_idx ON academy_class (academy_id);
CREATE INDEX IF NOT EXISTS academy_class_subject_idx ON academy_class (subject);

-- 3) 학원버스 노선/정류장 ----------------------------------------------------
CREATE TABLE IF NOT EXISTS bus_route (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id uuid NOT NULL REFERENCES academy(id) ON DELETE CASCADE,
  name       text NOT NULL,
  days       text[] NOT NULL DEFAULT '{}',
  direction  text NOT NULL DEFAULT 'pickup' CHECK (direction IN ('pickup','dropoff')),
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bus_route_academy_idx ON bus_route (academy_id);

CREATE TABLE IF NOT EXISTS bus_stop (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id   uuid NOT NULL REFERENCES bus_route(id) ON DELETE CASCADE,
  seq        integer NOT NULL DEFAULT 0,
  name       text NOT NULL,
  lat        double precision,
  lng        double precision,
  dong_code  text,                              -- "우리 동네 경유" 배지 매칭 키
  time_hint  text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bus_stop_route_idx ON bus_stop (route_id);
CREATE INDEX IF NOT EXISTS bus_stop_dong_idx ON bus_stop (dong_code);

-- 4) 재원생 집계(성적대·출신학교 분포) --------------------------------------
--    payload는 %/집계만. 개별 식별 불가. n_total>=5 미만 verified 미생성(집계 잡 강제).
CREATE TABLE IF NOT EXISTS cohort_stat (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id uuid NOT NULL REFERENCES academy(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('grade_band','school_dist')),
  period     text NOT NULL,                     -- 예: 2026H1
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  source     text NOT NULL DEFAULT 'claimed' CHECK (source IN ('claimed','verified')),
  n_total    integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cohort_stat_uq ON cohort_stat (academy_id, kind, period, source);

-- 5) 재원 표시 플래그(verified 집계 원천) ------------------------------------
--    consent_stats=통계 활용 동의. 원본 enrollment은 통계 외 용도 금지(§4).
CREATE TABLE IF NOT EXISTS academy_enrollment (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  academy_id    uuid NOT NULL REFERENCES academy(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'self_reported' CHECK (status IN ('self_reported','withdrawn')),
  consent_stats boolean NOT NULL DEFAULT false,
  ts            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS academy_enrollment_uq ON academy_enrollment (user_id, academy_id);
CREATE INDEX IF NOT EXISTS academy_enrollment_academy_idx ON academy_enrollment (academy_id);

-- 6) 리드(상담 신청) --------------------------------------------------------
CREATE TABLE IF NOT EXISTS academy_lead (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  academy_id   uuid NOT NULL REFERENCES academy(id) ON DELETE CASCADE,
  class_id     uuid REFERENCES academy_class(id) ON DELETE SET NULL,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb, -- 전달 동의 범위(요약만·성적 상세 미포함)
  status       text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','read','replied','closed')),
  ts           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS academy_lead_academy_idx ON academy_lead (academy_id);
CREATE INDEX IF NOT EXISTS academy_lead_user_idx ON academy_lead (user_id);
