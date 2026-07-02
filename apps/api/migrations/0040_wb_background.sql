-- 0040: 화이트보드 배경 이미지 — 첨부/촬영 이미지 위에 필기. 스냅샷에 배경 파일 참조 저장.
ALTER TABLE whiteboard_snapshot ADD COLUMN IF NOT EXISTS background_file_id uuid;
