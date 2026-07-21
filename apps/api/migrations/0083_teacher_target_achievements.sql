-- 상담사 목표대학 실적 태그(진단 매칭 §8 반환분 도입) — 자기신고 + 관리자 검증 배지.
-- target_achievements: [{tier, univ, dept?, year?, count?}] 자기신고 실적 배열(tier=목표 라인).
-- verified: 관리자 검증 완료 시 true(카드 '검증됨' 배지·매칭 가중 상향). 정산·금액 무관.
ALTER TABLE teacher_profile
  ADD COLUMN IF NOT EXISTS target_achievements jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS target_achievements_verified boolean NOT NULL DEFAULT false;
