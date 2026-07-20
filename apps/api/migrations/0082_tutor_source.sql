-- tutor_source 계측(경량) — 정산 레코드에 고용유형 스냅샷 차원 추가(additive).
-- ⚠ 금액·계산에 개입하지 않는다. 순수 라벨. employment_type 은 teacher_profile 에 이미 존재.
ALTER TABLE payroll_estimate ADD COLUMN IF NOT EXISTS tutor_source text;
