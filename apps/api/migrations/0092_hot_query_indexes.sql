-- 핫 쿼리 인덱스 보강 — 알림 폴링·QnA 풀/목록·답변 조회.
-- 근거: Postgres 는 FK·필터·정렬 컬럼을 자동 인덱싱하지 않음. 실측 쿼리 패턴 기준:
--   notification: where recipient_id order by created_at desc + where recipient_id, read_at null (전 사용자 폴링)
--   qna_post:     where {scope,status,assigned_teacher_id,student_id} + order by created_at (풀·목록·강제배정 스캔)
--   qna_answer:   where post_id(게시글별 답변·기존답변자 확인) / teacher_id(교사 성과 지표) — 둘 다 FK, 인덱스 부재
-- 전부 CREATE INDEX IF NOT EXISTS (멱등). CONCURRENTLY 미사용(러너가 db execute 로 순차 적용).

-- 알림: 사용자별 최신순 목록 + 미읽음 카운트/전체읽음(recipient_id 등가 접두)
CREATE INDEX IF NOT EXISTS idx_notification_recipient_created ON notification(recipient_id, created_at DESC);

-- QnA 게시글: 교사 배정 목록·클레임/강제배정 CAS 조회
CREATE INDEX IF NOT EXISTS idx_qna_post_assigned ON qna_post(assigned_teacher_id);
-- 학생 본인 질문 목록(최신순)
CREATE INDEX IF NOT EXISTS idx_qna_post_student_created ON qna_post(student_id, created_at DESC);
-- 풀 필터(공개/한정/지정 × 상태) + 강제배정 경과 스캔
CREATE INDEX IF NOT EXISTS idx_qna_post_scope_status_created ON qna_post(scope, status, created_at);

-- QnA 답변: 게시글별 답변 목록·기존답변자 확인(FK)
CREATE INDEX IF NOT EXISTS idx_qna_answer_post ON qna_answer(post_id);
-- 교사 성과 지표(응답률·채택률·평균 응답시간)
CREATE INDEX IF NOT EXISTS idx_qna_answer_teacher ON qna_answer(teacher_id);
