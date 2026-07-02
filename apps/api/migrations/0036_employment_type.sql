-- 0036: 선생님 고용형태(건당·기본급·시급 등) — 월간 시수 엑셀 업로드 및 대시보드 '고용형태' 컬럼 지원.
ALTER TABLE teacher_profile
  ADD COLUMN IF NOT EXISTS employment_type text;
