-- 커뮤니티 답변 1인 1건 + 수정 지원(채택/마감 전까지). 무한 중복 답변 방지.
-- updated_at: 최근 수정 시각(수정됨 표시·정렬 보조). 기존 행은 created 기준 기본값.
ALTER TABLE qna_community_answer ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 기존 중복 정리: (질문,작성자)별 1건만 남기고 나머지 숨김(삭제 아님·복구 가능).
--   남길 기준 = 채택된 것 우선 → 최초 작성 → id. 유니크 인덱스 적용 전 선행 정리.
UPDATE qna_community_answer a SET hidden = true
WHERE a.hidden = false AND EXISTS (
  SELECT 1 FROM qna_community_answer b
  WHERE b.post_id = a.post_id AND b.author_id = a.author_id AND b.hidden = false
    AND ( b.accepted > a.accepted
       OR (b.accepted = a.accepted AND b.created_at < a.created_at)
       OR (b.accepted = a.accepted AND b.created_at = a.created_at AND b.id < a.id) )
);

-- 1인 1답변 강제(숨김 제외). 서비스 레벨에서도 이중 방어(동시성 레이스 대비).
CREATE UNIQUE INDEX IF NOT EXISTS qna_community_answer_one_per_author_uq
  ON qna_community_answer (post_id, author_id) WHERE hidden = false;
