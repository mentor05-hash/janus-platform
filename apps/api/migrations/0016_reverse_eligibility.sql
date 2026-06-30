-- 역상담 대상 분류: 관리자 선택 / 학생 옵트인 (첫상담은 done_count=0 으로 계산)
ALTER TABLE student_profile
  ADD COLUMN IF NOT EXISTS reverse_admin BOOLEAN NOT NULL DEFAULT false,  -- 관리자가 역상담 대상으로 지정
  ADD COLUMN IF NOT EXISTS reverse_self  BOOLEAN NOT NULL DEFAULT false;  -- 학생이 역상담 받기 신청
