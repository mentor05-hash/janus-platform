-- 0020: 회원 등급 활성 토글(HR GRADE-b). 비활성 등급은 신규 구독 노출에서 제외.
ALTER TABLE membership_grade ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
