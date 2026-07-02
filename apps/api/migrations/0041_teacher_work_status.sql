-- 0041: 선생님 근무 상태 — on(근무중)/rest(휴게중)/off(퇴근). 모바일 오늘 탭에서 토글.
ALTER TABLE teacher_profile ADD COLUMN IF NOT EXISTS work_status text NOT NULL DEFAULT 'on';
