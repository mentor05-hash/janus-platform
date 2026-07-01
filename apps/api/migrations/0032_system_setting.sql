-- 전사 정책 설정(본사 마스터). 예: score_visibility = {student, guardian, placement}
CREATE TABLE IF NOT EXISTS system_setting (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
