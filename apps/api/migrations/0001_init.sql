-- =====================================================================
-- 잇올 1:1 멘토링 플랫폼 — PostgreSQL 스키마 (마이그레이션 초안)
-- 근거: 통합 스펙 v2.5 · ERD-API 초안 (O15) · 스택 확정 NestJS+PostgreSQL (O12)
-- 작성: 2026-06-29
-- 주의: 학생·보호자 인적사항/상담내용/결제/급여 등 민감정보는 운영 DB에만 저장(O13).
--       이 파일은 스키마(DDL)만 — 실데이터/시드는 포함하지 않음.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ---------- ENUM 타입 ----------
CREATE TYPE account_role      AS ENUM ('student','teacher','admin','hr','guardian');
CREATE TYPE account_status    AS ENUM ('pending','approved','inactive');
CREATE TYPE perm_level        AS ENUM ('L1','L2','L3');
CREATE TYPE teacher_grade_t   AS ENUM ('S','A','B');
CREATE TYPE consult_type      AS ENUM ('담임','교과','입시','심리');
CREATE TYPE consult_mode      AS ENUM ('board','chat','zoom','hand','offline');
CREATE TYPE session_mode      AS ENUM ('상담','질문');
CREATE TYPE booking_dir       AS ENUM ('student','reverse');
CREATE TYPE booking_status    AS ENUM ('new','confirmed','done','cancelled','rejected','noshow');
CREATE TYPE note_save_state   AS ENUM ('draft','final');
CREATE TYPE board_qtype       AS ENUM ('item','general');
CREATE TYPE board_scope       AS ENUM ('assigned','open');
CREATE TYPE billing_cycle     AS ENUM ('monthly','quarterly','yearly');
CREATE TYPE payer_t           AS ENUM ('guardian','student');
CREATE TYPE credit_txn_type   AS ENUM ('charge','spend','weekly_grant','weekly_expire','refund');
CREATE TYPE payreq_status     AS ENUM ('open','done','rejected','expired');
CREATE TYPE payreq_origin     AS ENUM ('manual','auto');
CREATE TYPE list_kind         AS ENUM ('fit','unfit');
CREATE TYPE cancel_route      AS ENUM ('substitute','priority','admin_manual','rebook_notice');

-- ---------- 1. 계정 · 사람 ----------
CREATE TABLE center (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  region      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE account (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role        account_role NOT NULL,
  center_id   UUID REFERENCES center(id),
  login_id    TEXT UNIQUE NOT NULL,
  pw_hash     TEXT NOT NULL,
  name        TEXT NOT NULL,
  status      account_status NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE membership_grade (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  tier          SMALLINT NOT NULL CHECK (tier BETWEEN 1 AND 4),
  weekly_credits INTEGER NOT NULL DEFAULT 0,
  expire_policy TEXT NOT NULL DEFAULT 'end_of_week',
  priority      SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE subscription_plan (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  price         INTEGER NOT NULL,
  billing_cycle billing_cycle NOT NULL,
  payer         payer_t NOT NULL DEFAULT 'guardian',
  grade_id      UUID REFERENCES membership_grade(id)
);

CREATE TABLE teacher_profile (
  account_id      UUID PRIMARY KEY REFERENCES account(id) ON DELETE CASCADE,
  center_id       UUID REFERENCES center(id),
  subjects        TEXT[] NOT NULL DEFAULT '{}',
  sub_subjects    TEXT[] NOT NULL DEFAULT '{}',
  grade           teacher_grade_t NOT NULL DEFAULT 'B',
  career          TEXT,
  rating          NUMERIC(2,1) DEFAULT 0,
  total_consult   INTEGER DEFAULT 0,
  re_request_rate NUMERIC(4,1),
  avg_response_min INTEGER,
  pay_base        INTEGER,
  teacher_category TEXT      -- 교과/멘토/입시 등
);

CREATE TABLE student_profile (
  account_id          UUID PRIMARY KEY REFERENCES account(id) ON DELETE CASCADE,
  center_id           UUID REFERENCES center(id),
  stay_time           JSONB,                        -- 요일×시간 체류
  membership_grade_id UUID REFERENCES membership_grade(id),
  active_subscription_id UUID,
  homeroom_teacher_id UUID REFERENCES teacher_profile(account_id),  -- 담임(선택)
  homeroom_assigned_at TIMESTAMPTZ,
  total_consult       INTEGER DEFAULT 0,
  done_count          INTEGER DEFAULT 0,
  rejected_count      INTEGER DEFAULT 0,
  noshow_count        INTEGER DEFAULT 0,
  last_consult_at     TIMESTAMPTZ,
  last_homeroom_at    TIMESTAMPTZ
);

CREATE TABLE staff_profile (
  account_id   UUID PRIMARY KEY REFERENCES account(id) ON DELETE CASCADE,
  staff_role   TEXT,                 -- 운영/HR
  center_id    UUID REFERENCES center(id),
  perm_level   perm_level NOT NULL DEFAULT 'L2'
);

CREATE TABLE guardian (
  account_id     UUID PRIMARY KEY REFERENCES account(id) ON DELETE CASCADE,
  notify_settings JSONB
);

CREATE TABLE guardian_student_link (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_id UUID NOT NULL REFERENCES guardian(account_id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES student_profile(account_id) ON DELETE CASCADE,
  relation    TEXT,                 -- 부/모/기타
  status      TEXT NOT NULL DEFAULT 'pending',  -- 승인/대기
  link_method TEXT,                 -- 초대코드/신청
  UNIQUE (guardian_id, student_id)
);

-- ---------- 2. 가용성 · 상담실 · 정책 ----------
CREATE TABLE work_schedule (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id          UUID NOT NULL REFERENCES teacher_profile(account_id) ON DELETE CASCADE,
  recurring_template  JSONB NOT NULL DEFAULT '{}',   -- 요일×시간
  weekly_overrides    JSONB NOT NULL DEFAULT '[]',   -- [{date, slots}]
  pre_book_horizon_days INTEGER NOT NULL DEFAULT 30
);

CREATE TABLE teacher_offline_availability (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES teacher_profile(account_id) ON DELETE CASCADE,
  center_id   UUID NOT NULL REFERENCES center(id),
  enabled     BOOLEAN NOT NULL DEFAULT false,
  time_windows JSONB NOT NULL DEFAULT '[]',
  UNIQUE (teacher_id, center_id)
);

CREATE TABLE room (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id   UUID NOT NULL REFERENCES center(id),
  type        TEXT,
  capacity    SMALLINT DEFAULT 1,
  operating_hours TEXT,
  setting     TEXT DEFAULT 'auto',   -- 수동/자동
  status      TEXT DEFAULT 'available'
);

CREATE TABLE zoom_policy (
  center_id        UUID PRIMARY KEY REFERENCES center(id) ON DELETE CASCADE,
  concurrent_limit SMALLINT NOT NULL DEFAULT 6,
  allow_map        JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE blocked_time (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id   UUID NOT NULL REFERENCES center(id),
  type        TEXT,                  -- 원장상담/특강/모의고사
  start_at    TIMESTAMPTZ NOT NULL,
  end_at      TIMESTAMPTZ NOT NULL,
  scope       TEXT,
  set_by_level perm_level
);

CREATE TABLE feature_availability (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       TEXT NOT NULL,         -- 전사/센터/캠프/외부생
  center_id   UUID REFERENCES center(id),
  target_type TEXT NOT NULL,         -- category/mode/board/online/offline
  target_value TEXT NOT NULL,        -- 담임/심리/zoom/...
  period_start DATE,
  period_end   DATE,
  enabled     BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE category_mode_policy (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id     UUID REFERENCES center(id),
  consult_type  consult_type NOT NULL,
  allowed_modes consult_mode[] NOT NULL DEFAULT '{}'
);

-- 요금정책: 단일 소스. 방식별 행 + 게시판 건당 + 점유료/유료컨설팅은 meta
CREATE TABLE pricing_policy (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id   UUID REFERENCES center(id),       -- NULL=전사 기본
  mode        consult_mode NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  paid        BOOLEAN NOT NULL DEFAULT true,
  per_hour    INTEGER NOT NULL DEFAULT 0,
  surcharge_pct SMALLINT NOT NULL DEFAULT 0,     -- S급 할증
  board_item_fee  INTEGER,                        -- 게시판 문항(건당)
  board_general_fee INTEGER,                      -- 게시판 일반(건당)
  offline_occupancy_fee INTEGER,                  -- 오프라인 점유 기본요금
  paid_consulting_fee   INTEGER,                  -- 입시 유료컨설팅 별도 단가
  updated_by  UUID, updated_at TIMESTAMPTZ DEFAULT now(),
  CHECK (board_item_fee IS NULL OR board_general_fee IS NULL OR board_item_fee >= board_general_fee)
);

CREATE TABLE limit_policy (
  center_id          UUID PRIMARY KEY REFERENCES center(id) ON DELETE CASCADE,
  reservation_limit  SMALLINT,            -- 동시 보유(NULL=무제한)
  classify_fit_limit SMALLINT DEFAULT 10,
  classify_unfit_limit SMALLINT DEFAULT 30
);

CREATE TABLE consultation_policy (
  center_id           UUID PRIMARY KEY REFERENCES center(id) ON DELETE CASCADE,
  homeroom_cycle_days SMALLINT DEFAULT 30,  -- 담임 목표 주기(월 1회)
  warn_days           SMALLINT,
  danger_days         SMALLINT
);

CREATE TABLE guardian_visibility_policy (
  center_id   UUID PRIMARY KEY REFERENCES center(id) ON DELETE CASCADE,
  base_policy TEXT NOT NULL DEFAULT 'by_type'   -- 전체/비공개/유형별
);

CREATE TABLE penalty_policy (
  center_id          UUID PRIMARY KEY REFERENCES center(id) ON DELETE CASCADE,
  cancel_threshold   SMALLINT,
  noshow_threshold   SMALLINT,
  reject_threshold   SMALLINT,
  restrict_minutes   INTEGER,
  ranking_weight_down NUMERIC(4,2)
);

CREATE TABLE payroll_policy (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id       UUID REFERENCES center(id),
  teacher_category TEXT,
  cycle           TEXT NOT NULL DEFAULT 'monthly',   -- 카테고리별 변경 가능
  per_case_rate   INTEGER,
  qna_rate        INTEGER,
  grade_allowance JSONB,
  hourly_rate     INTEGER,
  auto_incentive  JSONB         -- {on, cond, amount}
);

-- ---------- 3. 매칭 · 예약 · 시간대 ----------
CREATE TABLE match_request (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES student_profile(account_id),
  direction     booking_dir NOT NULL DEFAULT 'student',
  consult_type  consult_type,
  sub_type      TEXT,
  mode_pref     TEXT,                  -- online/offline/any
  stay_time     JSONB,
  result_booking_id UUID,
  fallback      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE booking (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES student_profile(account_id),
  teacher_id    UUID NOT NULL REFERENCES teacher_profile(account_id),
  center_id     UUID REFERENCES center(id),
  consult_type  consult_type NOT NULL,
  sub_type      TEXT,
  mode          consult_mode NOT NULL,
  session_mode  session_mode,
  direction     booking_dir NOT NULL DEFAULT 'student',
  start_at      TIMESTAMPTZ,
  end_at        TIMESTAMPTZ,
  buffer_before SMALLINT DEFAULT 10,
  buffer_after  SMALLINT DEFAULT 10,
  status        booking_status NOT NULL DEFAULT 'new',
  room_id       UUID REFERENCES room(id),
  attachments   JSONB,
  content       TEXT,
  charged_credits INTEGER DEFAULT 0,
  origin        TEXT,                  -- 직접/가이드/자동/역상담
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_booking_student ON booking(student_id, status);
CREATE INDEX idx_booking_teacher ON booking(teacher_id, start_at);

CREATE TABLE time_slot (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES teacher_profile(account_id) ON DELETE CASCADE,
  slot_date   DATE NOT NULL,
  slot_index  SMALLINT NOT NULL,       -- 10분 단위 인덱스
  status      TEXT NOT NULL DEFAULT 'work',  -- work/off/leave/booked/buffer
  booking_id  UUID REFERENCES booking(id),
  UNIQUE (teacher_id, slot_date, slot_index)
);

CREATE TABLE consultation_note (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID UNIQUE NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES student_profile(account_id),
  teacher_id  UUID NOT NULL REFERENCES teacher_profile(account_id),
  consult_type consult_type,
  sub_type    TEXT,
  core_summary TEXT,        -- 공개(학생·보호자)
  memo        TEXT,         -- 내부
  homework    TEXT,         -- 공개
  future_dir  TEXT,         -- 공개
  guardian_visible BOOLEAN DEFAULT true,
  save_state  note_save_state NOT NULL DEFAULT 'draft',
  author_id   UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_note_student ON consultation_note(student_id, created_at DESC);

CREATE TABLE board_question (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES student_profile(account_id),
  consult_type  consult_type,
  q_type        board_qtype NOT NULL,
  scope         board_scope NOT NULL,
  assigned_teacher_id UUID REFERENCES teacher_profile(account_id),
  difficulty    TEXT,
  attachments   JSONB,
  charge        INTEGER,
  status        TEXT DEFAULT 'open',
  taken_teacher_id UUID REFERENCES teacher_profile(account_id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cancellation_event (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
  reason          TEXT,
  route           cancel_route,
  notify_targets  TEXT[] NOT NULL DEFAULT '{}',  -- student/guardian/admin/substitute
  channels        TEXT[] NOT NULL DEFAULT '{}',  -- app/sms/kakao
  credit_refunded INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 4. 크레딧 · 결제 ----------
CREATE TABLE credit_account (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID UNIQUE NOT NULL REFERENCES student_profile(account_id) ON DELETE CASCADE,
  purchased_balance INTEGER NOT NULL DEFAULT 0,
  granted_balance   INTEGER NOT NULL DEFAULT 0,
  grant_expire_at   TIMESTAMPTZ,
  reserved_credits  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE credit_transaction (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES credit_account(id) ON DELETE CASCADE,
  type        credit_txn_type NOT NULL,
  amount      INTEGER NOT NULL,        -- ±
  balance     INTEGER NOT NULL,
  description TEXT,
  method      TEXT,
  ref_type    TEXT, ref_id UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_credit_txn_acct ON credit_transaction(account_id, created_at DESC);

CREATE TABLE weekly_credit_grant (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES credit_account(id) ON DELETE CASCADE,
  grade_id    UUID REFERENCES membership_grade(id),
  amount      INTEGER NOT NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expire_at   TIMESTAMPTZ NOT NULL,    -- 일요일 24:00
  remaining   INTEGER NOT NULL
);

CREATE TABLE payment_request (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES student_profile(account_id),
  guardian_id   UUID REFERENCES guardian(account_id),
  needed_credits INTEGER NOT NULL,
  ref_type      TEXT, ref_id UUID,
  status        payreq_status NOT NULL DEFAULT 'open',
  origin        payreq_origin NOT NULL DEFAULT 'manual',
  expire_at     TIMESTAMPTZ,
  channels      TEXT[] DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_account_id UUID NOT NULL REFERENCES account(id),
  amount        INTEGER NOT NULL,
  pg_provider   TEXT,
  pg_txn_id     TEXT,
  target        TEXT,                  -- 충전/구독
  status        TEXT DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 5. 분류 · 평가 · 운영 ----------
CREATE TABLE teacher_list_entry (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES student_profile(account_id) ON DELETE CASCADE,
  teacher_id  UUID NOT NULL REFERENCES teacher_profile(account_id) ON DELETE CASCADE,
  list_kind   list_kind NOT NULL,
  UNIQUE (student_id, teacher_id)      -- 한 명은 한쪽에만
);

CREATE TABLE review (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID UNIQUE NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES student_profile(account_id),  -- 익명 노출
  teacher_id    UUID NOT NULL REFERENCES teacher_profile(account_id),
  rating_attitude SMALLINT, rating_content SMALLINT, rating_skill SMALLINT, rating_again SMALLINT,
  text          TEXT,
  done_confirmed BOOLEAN DEFAULT false,
  reported      BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teacher_grade (
  teacher_id    UUID PRIMARY KEY REFERENCES teacher_profile(account_id) ON DELETE CASCADE,
  grade         teacher_grade_t NOT NULL,
  top_percent   NUMERIC(4,1),
  next_review_at DATE,
  allowance     JSONB
);

CREATE TABLE payroll_estimate (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id      UUID NOT NULL REFERENCES teacher_profile(account_id) ON DELETE CASCADE,
  cycle           TEXT,
  confirmed_amount INTEGER DEFAULT 0,
  expected_amount  INTEGER DEFAULT 0,
  breakdown       JSONB,
  period_start    DATE, period_end DATE
);

CREATE TABLE ops_stat (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id     UUID REFERENCES center(id),
  period        TEXT,
  active_users  INTEGER, match_rate NUMERIC(4,1), avg_satisfaction NUMERIC(2,1),
  weekly_consult INTEGER, grade_dist JSONB, weekly_trend JSONB, teacher_stats JSONB
);

CREATE TABLE notification (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES account(id),
  type        TEXT,                  -- cancel/payment_request/reminder/...
  channels    TEXT[] DEFAULT '{}',   -- app/sms/kakao
  payload     JSONB,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK 보강: student_profile.active_subscription_id
CREATE TABLE student_subscription (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES student_profile(account_id) ON DELETE CASCADE,
  plan_id     UUID NOT NULL REFERENCES subscription_plan(id),
  status      TEXT DEFAULT 'active',
  started_at  TIMESTAMPTZ DEFAULT now(),
  next_billing_at TIMESTAMPTZ
);

-- =====================================================================
-- 6. 확장 모듈 (단계적 도입) — 온라인 Q&A · 랭킹 · 신고/차단
-- =====================================================================
CREATE TABLE qna_post (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES student_profile(account_id),
  subject     TEXT, difficulty TEXT, scope board_scope DEFAULT 'open',
  assigned_teacher_id UUID REFERENCES teacher_profile(account_id),
  body        TEXT, attachments JSONB,
  status      TEXT DEFAULT 'open',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE qna_answer (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES qna_post(id) ON DELETE CASCADE,
  teacher_id  UUID NOT NULL REFERENCES teacher_profile(account_id),
  body        TEXT, accepted BOOLEAN DEFAULT false, pay_eligible BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE report (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT, target_id UUID, reason TEXT,
  status      TEXT DEFAULT 'received', action TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE teacher_block (
  student_id  UUID NOT NULL REFERENCES student_profile(account_id),
  teacher_id  UUID NOT NULL REFERENCES teacher_profile(account_id),
  PRIMARY KEY (student_id, teacher_id)
);

-- =====================================================================
-- 끝. 다음: NestJS TypeORM/Prisma 엔티티 매핑 + 시드(더미)·인덱스 튜닝.
-- 미결정 의존: PG 결제(O2), 가중제한 임계(O31), 단가값(O20/O33).
-- =====================================================================
