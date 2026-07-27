-- 누락 인덱스 보강(감사 ⑤) — FK·필터 컬럼(Postgres 자동 인덱싱 안 함). 실측 쿼리 근거:
--   booking: center_id(5회 — 센터 대시보드 필터) + start_at
--   review: teacher_id(4회 — 교사 평점 집계)
--   payment: payer_account_id(2회 — 결제내역) + created_at
--   payroll_estimate: teacher_id(3회 — 급여 추정 조회)
CREATE INDEX IF NOT EXISTS idx_booking_center_start ON booking(center_id, start_at);
CREATE INDEX IF NOT EXISTS idx_review_teacher ON review(teacher_id);
CREATE INDEX IF NOT EXISTS idx_payment_payer_created ON payment(payer_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_estimate_teacher ON payroll_estimate(teacher_id);
