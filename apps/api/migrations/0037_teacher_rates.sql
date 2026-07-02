-- 0037: 근무자별 급여 단가(건당단가·시급) — 엑셀 업로드로 지정, 급여 산정 시 정책보다 우선.
-- 기본급(고정 월 기본급)은 기존 teacher_profile.pay_base 재사용.
ALTER TABLE teacher_profile
  ADD COLUMN IF NOT EXISTS per_case_rate integer,
  ADD COLUMN IF NOT EXISTS hourly_rate   integer;
