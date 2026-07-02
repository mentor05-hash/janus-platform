-- 0035: 선생님별 지원 상담 방식(줌/채팅/필기/오프라인) — "방식 먼저 선택" 검색 지원.
-- 학생이 원하는 진행 방식으로 상담 가능한 선생님만 필터하기 위한 per-teacher capability.
ALTER TABLE teacher_profile
  ADD COLUMN IF NOT EXISTS modes text[] NOT NULL DEFAULT '{}';

-- 오프라인 근무풀이 등록된 선생님은 offline 방식을 기본 지원으로 반영.
UPDATE teacher_profile tp
SET modes = ARRAY(SELECT DISTINCT unnest(tp.modes || ARRAY['offline']))
WHERE EXISTS (
  SELECT 1 FROM teacher_offline_availability o WHERE o.teacher_id = tp.account_id
);
