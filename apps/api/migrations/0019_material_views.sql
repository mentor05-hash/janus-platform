-- 0019: 자료 조회수(T4). 다운로드 시 증가.
ALTER TABLE material ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;
