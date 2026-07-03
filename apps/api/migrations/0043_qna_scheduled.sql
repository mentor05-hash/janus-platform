-- 전임 질문 답변블록 배정 추적: 이미 근무시간에 배정된 질문 재배정 방지
ALTER TABLE qna_post ADD COLUMN IF NOT EXISTS scheduled_booking_id uuid;
