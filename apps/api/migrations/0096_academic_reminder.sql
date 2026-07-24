-- 학사일정 임박 자동 알림 — 이미 발송한 오프셋(d7/d1/d0)을 이벤트별로 기록해 중복 방지.
ALTER TABLE academic_event ADD COLUMN IF NOT EXISTS reminded text[] NOT NULL DEFAULT '{}';
