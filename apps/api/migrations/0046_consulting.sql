-- =====================================================================
-- 0046 — consulting (대입 컨설팅 신청 접수 시스템 · 설계안 §2)
-- 신청 한 건 = 신청자·업로드 자료·신청시간·결제여부·LLM 분석을 하나로 묶는 애그리거트.
-- Phase 1(도메인 & 신청/업로드)에서 4개 테이블을 모두 생성한다.
--   · 결제(consulting_payment)는 원화 기준. 크레딧 결제 불가(추후 정책).
--   · 자료(consulting_document)는 PDF·Word만 허용(형식 검증은 앱 레벨).
--   · 열람/분석은 결제 완료 후(게이팅) — payment/analysis 활성 로직은 Phase 2/3.
-- =====================================================================

-- 신청 (애그리거트 루트)
CREATE TABLE IF NOT EXISTS consulting_application (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_account_id uuid REFERENCES account(id) ON DELETE SET NULL,        -- 회원이면 참조, 비회원 null
  applicant_name       text NOT NULL,                                         -- TODO(PII): 앱레벨 암호화
  applicant_phone      text NOT NULL,                                         -- TODO(PII): 앱레벨 암호화
  student_grade        text NOT NULL,                                         -- 고1·고2·고3·N수·기타
  interest_type        text NOT NULL,                                         -- susi·jeongsi·both·essay
  package              text NOT NULL,
  assignment_mode      text NOT NULL,                                         -- 상품별: at_application·manual
  status               text NOT NULL DEFAULT 'submitted',
  message              text,
  consultant_id        uuid REFERENCES account(id) ON DELETE SET NULL,        -- 배정 컨설턴트(teacher 계정)
  consent_at           timestamptz,                                           -- 개인정보 동의 시각
  submitted_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),                    -- 신청 시간
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consulting_application_package_chk
    CHECK (package IN ('single','season','full')),
  CONSTRAINT consulting_application_assignment_chk
    CHECK (assignment_mode IN ('at_application','manual')),
  CONSTRAINT consulting_application_status_chk
    CHECK (status IN ('draft','submitted','awaiting_payment','paid','in_review','completed','canceled'))
);
CREATE INDEX IF NOT EXISTS idx_consulting_application_applicant ON consulting_application(applicant_account_id);
CREATE INDEX IF NOT EXISTS idx_consulting_application_consultant ON consulting_application(consultant_id);
CREATE INDEX IF NOT EXISTS idx_consulting_application_status ON consulting_application(status);

-- 업로드 자료 (생기부·성적표 등) — 실제 바이트는 stored_file(StorageProvider)에 저장
CREATE TABLE IF NOT EXISTS consulting_document (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES consulting_application(id) ON DELETE CASCADE,
  file_id        uuid REFERENCES stored_file(id) ON DELETE SET NULL,
  type           text NOT NULL,                                               -- student_record·transcript·mock_exam·other
  original_name  text NOT NULL,
  mime           text NOT NULL,                                               -- 허용: pdf·msword·wordprocessingml.document
  size_bytes     integer NOT NULL,
  scan_status    text NOT NULL DEFAULT 'pending',                             -- pending·clean·rejected
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consulting_document_type_chk
    CHECK (type IN ('student_record','transcript','mock_exam','other')),
  CONSTRAINT consulting_document_scan_chk
    CHECK (scan_status IN ('pending','clean','rejected'))
);
CREATE INDEX IF NOT EXISTS idx_consulting_document_application ON consulting_document(application_id);

-- 결제 (원화 · 크레딧 불가) — 게이팅은 status='paid'만 신뢰
CREATE TABLE IF NOT EXISTS consulting_payment (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES consulting_application(id) ON DELETE CASCADE,
  amount_won     integer NOT NULL,
  method         text NOT NULL DEFAULT 'manual',                             -- manual·pg (credit는 추후)
  status         text NOT NULL DEFAULT 'pending',                            -- pending·paid·failed·refunded
  pg_provider    text,
  pg_ref         text,
  paid_at        timestamptz,
  refunded_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consulting_payment_method_chk
    CHECK (method IN ('manual','pg')),
  CONSTRAINT consulting_payment_status_chk
    CHECK (status IN ('pending','paid','failed','refunded'))
);

-- LLM 분석 (결제 완료 후 생성) — 3산출물 JSON
CREATE TABLE IF NOT EXISTS consulting_analysis (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES consulting_application(id) ON DELETE CASCADE,
  model          text,
  status         text NOT NULL DEFAULT 'queued',                             -- queued·running·done·failed
  summary        jsonb,
  diagnostic     jsonb,
  document_check jsonb,
  token_usage    integer,
  generated_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consulting_analysis_status_chk
    CHECK (status IN ('queued','running','done','failed'))
);
