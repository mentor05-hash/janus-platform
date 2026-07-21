-- 야누스 학원찾기 세션 3 — 학원 클레임(사업자 인증→운영자 승인) + 소유자 관리 권한.
-- academy_claim: 학원 클레임 신청 원장. 사업자등록 자료는 stored_file(biz_reg_file_id) 참조 +
--   번호는 마스킹만 저장(원본 미저장). 승인 시 academy.owner_id 지정 → 반·버스·자가통계 편집 권한.
CREATE TABLE IF NOT EXISTS academy_claim (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academy_id      uuid NOT NULL REFERENCES academy(id) ON DELETE CASCADE,
  claimant_id     uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  biz_reg_file_id uuid,                 -- stored_file 참조(사업자등록증 업로드). 선택.
  biz_reg_masked  text,                 -- 사업자번호 마스킹본(원본 미저장)
  contact         text,
  note            text,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note     text,
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- 학원당 활성(대기·승인) 클레임은 1건만.
CREATE UNIQUE INDEX IF NOT EXISTS academy_claim_active_uq ON academy_claim (academy_id) WHERE status IN ('pending','approved');
CREATE INDEX IF NOT EXISTS academy_claim_claimant_idx ON academy_claim (claimant_id);
CREATE INDEX IF NOT EXISTS academy_claim_status_idx ON academy_claim (status);

-- 승인된 운영자(반·버스·통계 편집 권한 게이트). NULL = 미클레임/공공.
ALTER TABLE academy ADD COLUMN IF NOT EXISTS owner_id uuid;
CREATE INDEX IF NOT EXISTS academy_owner_idx ON academy (owner_id);
