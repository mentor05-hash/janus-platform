-- =====================================================================
-- 0010 — scheduled_announcement (예약 공지, §3 notification)
-- 미래 시각에 발송할 공지를 저장. 스케줄러가 도래분을 발송하고 status 갱신.
-- =====================================================================

CREATE TABLE IF NOT EXISTS scheduled_announcement (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   UUID NOT NULL,
  targets      TEXT[] NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  center_id    UUID,                        -- 스코프(NULL = 전체)
  channels     TEXT[] NOT NULL DEFAULT ARRAY['app'],
  scheduled_at TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | cancelled
  sent_at      TIMESTAMPTZ,
  sent_count   INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sched_ann_due ON scheduled_announcement(status, scheduled_at);
