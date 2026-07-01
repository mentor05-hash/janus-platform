-- 급여 정산: 상태(확정→지급완료) + 공제(원천징수·4대보험) + 실지급액.
ALTER TABLE payroll_estimate ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'; -- draft|confirmed|paid
ALTER TABLE payroll_estimate ADD COLUMN IF NOT EXISTS deductions jsonb;
ALTER TABLE payroll_estimate ADD COLUMN IF NOT EXISTS net_amount integer;
ALTER TABLE payroll_estimate ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE payroll_estimate ADD COLUMN IF NOT EXISTS settled_by uuid;
