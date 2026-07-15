-- 강좌 상세/진도 — 영상 슬롯 + 수강 진도율.
ALTER TABLE lecture ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE lecture_enrollment ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0; -- 0~100
ALTER TABLE lecture_enrollment ADD COLUMN IF NOT EXISTS last_at timestamptz;
