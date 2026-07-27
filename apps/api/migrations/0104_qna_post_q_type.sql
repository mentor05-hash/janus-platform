-- =====================================================================
-- Q&A 질문 유형(q_type) 영속 — **문항형 요금 티어를 도달 가능하게** 만든다.
--
-- 무엇이 깨져 있었나:
--   · `CreateQuestionDto` 는 `qType`('item' | 'general')을 받고, 웹 등록 화면은 '유형' 선택기와
--     함께 **문항형 요금(board_item_fee = 8,000)을 학생에게 표시**했다.
--   · 그런데 qna_post 에 저장할 컬럼이 없어 값이 버려지고, `escalateToHuman` 은 항상
--     `quoteBoard('general')` 로 견적했다 → 학생은 8,000 을 보고 **4,000 만 과금**됐다.
--     (학생에게 불리한 방향은 아니지만 표시와 과금이 어긋나고 상위 요금 티어가 미구현이었다.)
--   · pricing_policy.board_item_fee 는 시드·DB 에 실재했고 quoteBoard 도 두 티어를 이미 지원했다 —
--     끊어져 있던 고리는 '저장'과 '견적 시 참조' 둘뿐이다.
--
-- 하위호환: 기존 행은 전부 general 요금으로 과금됐으므로 'general' 로 채운다(추정이 아니라 사실).
--   앞으로 NULL 이 들어올 여지를 남기지 않기 위해 DEFAULT 'general' 을 둔다.
--   값 집합은 애플리케이션(DTO @IsIn)에서 강제하고 DB 제약은 걸지 않는다 — 티어 추가 시
--   마이그레이션 없이 확장 가능해야 한다(요금 티어는 정책이며 스키마가 아니다).
-- =====================================================================
ALTER TABLE qna_post ADD COLUMN IF NOT EXISTS q_type text NOT NULL DEFAULT 'general';

COMMENT ON COLUMN qna_post.q_type IS
  'Q&A 요금 티어 — general(board_general_fee) | item(board_item_fee, 고난도 문항). escalateToHuman 견적 기준.';

-- 과금 집계·정산 조회가 유형별로 갈리므로 부분 인덱스 하나만 둔다(문항형은 소수 예상).
CREATE INDEX IF NOT EXISTS idx_qna_post_q_type_item ON qna_post (created_at DESC) WHERE q_type = 'item';
