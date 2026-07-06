-- =====================================================================
-- 0048 — class_recording (강의 녹화 · 필수)
-- A/V 녹화(SFU egress)와 판서 리플레이(스트로크 타임라인)를 함께 관리.
-- 실제 A/V 녹화는 MediaProvider(SFU)가 수행, 여기엔 메타·산출물 참조를 저장.
-- =====================================================================
CREATE TABLE IF NOT EXISTS class_recording (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_session_id uuid NOT NULL REFERENCES class_session(id) ON DELETE CASCADE,
  kind             text NOT NULL DEFAULT 'av',              -- av(SFU) · whiteboard(판서 리플레이)
  provider         text,                                    -- mock · livekit · mediasoup …
  recording_ref    text,                                    -- provider 측 녹화 식별자
  status           text NOT NULL DEFAULT 'recording',       -- recording · done · failed
  url              text,                                    -- 산출물 URL(완료 시)
  size_bytes       bigint,
  duration_sec     integer,
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_recording_kind_chk CHECK (kind IN ('av','whiteboard')),
  CONSTRAINT class_recording_status_chk CHECK (status IN ('recording','done','failed'))
);
CREATE INDEX IF NOT EXISTS idx_class_recording_class ON class_recording(class_session_id);
