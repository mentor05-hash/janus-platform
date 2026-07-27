-- 수능 성적 자가 입력 — 세부과목(선택과목) 메타. C1(janus_score) 키는 불변, subject는 정본(국어·수학…) 유지.
-- 세부과목(화법과작문·미적분·생활과윤리·일본어Ⅰ 등)은 참고 메타로만 저장(브리지는 subject만 매핑).
ALTER TABLE score_item ADD COLUMN IF NOT EXISTS sub_subject text;
