-- janus_goal 최소 규약 — 목표 tier/avg(기존)에 목표 대학·학과 추가.
-- 상담기록·격차 리포트(janus_report)·컨설팅이 공유하는 목표 계약. 전형(track)은 확장 여지(추가만).
ALTER TABLE student_profile ADD COLUMN IF NOT EXISTS goal_university text;
ALTER TABLE student_profile ADD COLUMN IF NOT EXISTS goal_department text;
