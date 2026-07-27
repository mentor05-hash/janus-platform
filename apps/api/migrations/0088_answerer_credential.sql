-- 야누스 N33 축 A(신뢰) — 답변자 자기신고 자격(claimed). 검증(verified)은 후속(IdentityVerify 연동).
-- answerer_credential: 답변자가 과목별로 스스로 신고하는 실력 근거(예: "수학 1등급").
--   verify_tier 기본 'claimed'(자기신고·미검증). 원본 성적표는 저장하지 않는다(PII 비보관 — CLAUDE.md §4).
--   노출 게이트(표본·검증)는 N33 후속. 여기선 저장·조회만.
CREATE TABLE IF NOT EXISTS answerer_credential (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  subject       text NOT NULL,                    -- 과목(예: 수학·영어). 빈 문자열 불가.
  claimed_grade text,                             -- 자기신고 근거(예: "1등급"·"의대 재학"). 자유 텍스트.
  verify_tier   text NOT NULL DEFAULT 'claimed' CHECK (verify_tier IN ('claimed','verified')),
  verified_at   timestamptz,                      -- verified 승격 시점(후속). claimed 는 NULL.
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- 답변자·과목 조합은 1건(과목별 최신 신고로 갱신).
CREATE UNIQUE INDEX IF NOT EXISTS answerer_credential_acct_subj_uq ON answerer_credential (account_id, subject);
CREATE INDEX IF NOT EXISTS answerer_credential_acct_idx ON answerer_credential (account_id);
