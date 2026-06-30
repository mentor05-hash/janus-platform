-- 0015 — 선생님 자료실(material). 업로드 파일(stored_file) + 게시 메타·공개범위.
-- 공개범위 visibility: 'public'(전사) | 'center'(자기 센터) | 'private'(본인·관리자만).

CREATE TABLE IF NOT EXISTS material (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES teacher_profile(account_id) ON DELETE CASCADE,
  center_id   UUID REFERENCES center(id) ON DELETE SET NULL,
  file_id     UUID REFERENCES stored_file(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  subject     TEXT,                       -- 과목/분류(자유)
  visibility  TEXT NOT NULL DEFAULT 'center',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT material_visibility_chk CHECK (visibility IN ('public','center','private'))
);
CREATE INDEX IF NOT EXISTS idx_material_center ON material (center_id);
CREATE INDEX IF NOT EXISTS idx_material_teacher ON material (teacher_id);
