-- 선생님 상담 인지 확인(ack) — 자동확정(질문승격 등) 예약의 인지 증빙 + 미인지 노쇼 판정 근거.
ALTER TABLE booking ADD COLUMN IF NOT EXISTS teacher_ack_at timestamptz;
