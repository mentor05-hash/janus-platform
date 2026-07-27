-- 야누스 학원찾기 세션 4 — 재원생 출신학교 자기신고(집계용). school_dist(k-익명) 원천.
-- ⚠ 개별 학교명은 집계에서 n<5 시 "기타"로 합산 후에만 저장(집계 잡 강제). 원본 enrollment 은 통계 외 금지.
ALTER TABLE academy_enrollment ADD COLUMN IF NOT EXISTS school text;
