-- 0021: 학생 학교 학년(HR 학생 관리·학부모 카드 표시용).
ALTER TABLE student_profile ADD COLUMN IF NOT EXISTS school_grade text;
