-- 본부 결정 ① 학부모 동의·본인확인 — 미성년 자녀 데이터 전달 게이트.
-- guardian_data_consent: (guardian, student) 쌍당 본인확인 결과 + 데이터 전달 동의를 1행으로.
--   · 본인확인(verify_*): 실제 PASS/NICE 등은 어댑터 뒤(계약·키 후). CI/DI 원본은 저장 금지 —
--     verify_ref 에 마스킹 참조만. stub 은 dev/데모용.
--   · 전달 동의(consent_delivery): 본인확인 완료(verified) 후에만 true 가능(서비스 강제).
-- ⚠ 직접 push 는 이 동의가 있어도 시스템 플래그 OFF 이면 하지 않는다(INV-10, 이중 방어). 실채널은 stub 유지.
CREATE TABLE IF NOT EXISTS guardian_data_consent (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_id            uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  student_id             uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  verify_status          text NOT NULL DEFAULT 'unverified' CHECK (verify_status IN ('unverified','verified','failed')),
  verify_method          text CHECK (verify_method IN ('phone','ipin','cert','manual')),
  verified_name          text,
  verify_ref             text,                 -- 마스킹된 참조(예: DI 해시 앞 8자 + ***). 원본 CI/DI 미저장.
  verify_provider        text NOT NULL DEFAULT 'stub',
  verified_at            timestamptz,
  consent_delivery       boolean NOT NULL DEFAULT false,
  consent_policy_version text NOT NULL DEFAULT 'v1',
  consent_at             timestamptz,
  revoked_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS guardian_data_consent_uq ON guardian_data_consent (guardian_id, student_id);
CREATE INDEX IF NOT EXISTS guardian_data_consent_student_idx ON guardian_data_consent (student_id);
