-- =====================================================================
-- 0011 — 예약 공지 사전알림 플래그 + 공지 템플릿 (§3 notification)
-- reminder_sent: 발송 전날(24h 내) 예약자에게 사전알림 1회 발송 여부.
-- announcement_template: 자주 쓰는 공지 양식을 미리 저장해 재사용.
-- =====================================================================

ALTER TABLE scheduled_announcement
  ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS announcement_template (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL,
  center_id  UUID,                          -- 소유 스코프(NULL = 본사 공용)
  name       TEXT NOT NULL,
  targets    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  channels   TEXT[] NOT NULL DEFAULT ARRAY['app'],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ann_template_scope ON announcement_template(center_id);
