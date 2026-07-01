-- 성적 업로드: 성적표(기간·시험) + 과목별 점수. 엑셀/수동/OCR 입력.
CREATE TABLE IF NOT EXISTS score_report (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  center_id      uuid,
  period         text NOT NULL,              -- 예: 2026-1학기 중간고사
  exam_type      text,                       -- 중간/기말/모의고사 등(선택)
  report_file_id uuid,                        -- 성적표 이미지(선택)
  source         text NOT NULL DEFAULT 'manual', -- manual|excel|ocr
  note           text,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, period)
);
CREATE INDEX IF NOT EXISTS idx_score_report_period ON score_report (period);
CREATE INDEX IF NOT EXISTS idx_score_report_center ON score_report (center_id);
CREATE INDEX IF NOT EXISTS idx_score_report_student ON score_report (student_id);

CREATE TABLE IF NOT EXISTS score_item (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  uuid NOT NULL REFERENCES score_report(id) ON DELETE CASCADE,
  subject    text NOT NULL,
  score      numeric(6,2),
  max_score  numeric(6,2) DEFAULT 100,
  grade      text,                            -- 등급/석차(선택)
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_score_item_report ON score_item (report_id);
