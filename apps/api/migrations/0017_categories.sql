-- 카테고리(본사관리자 관리) + 자료 category 컬럼
CREATE TABLE IF NOT EXISTS category (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL CHECK (kind IN ('material', 'teacher')),
  name       text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, name)
);

ALTER TABLE material ADD COLUMN IF NOT EXISTS category text;

-- 기본 카테고리 시드(있으면 무시)
INSERT INTO category (kind, name, sort_order) VALUES
  ('material','기출/모의고사',1),('material','개념정리',2),('material','오답노트',3),('material','입시자료',4),
  ('teacher','내신',1),('teacher','수능',2),('teacher','논술',3),('teacher','면접',4)
ON CONFLICT (kind, name) DO NOTHING;
