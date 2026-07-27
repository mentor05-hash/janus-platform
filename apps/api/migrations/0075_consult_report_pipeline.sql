-- R2~R5 상담 요약 파이프라인 — 전사문·리포트·접근 감사 로그.
CREATE TABLE IF NOT EXISTS consult_transcript (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id uuid NOT NULL UNIQUE,
  engine       text NOT NULL,
  lang         text NOT NULL DEFAULT 'ko',
  text         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consult_report (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    uuid NOT NULL UNIQUE,
  transcript_id uuid,
  body          jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'draft',
  approved_by   uuid,
  sent_at       timestamptz,
  opened_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consult_report_status ON consult_report(status);

CREATE TABLE IF NOT EXISTS media_access_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL,
  target_id   uuid NOT NULL,
  actor_id    uuid,
  action      text NOT NULL,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_media_access_log_target ON media_access_log(target_type, target_id, at);
