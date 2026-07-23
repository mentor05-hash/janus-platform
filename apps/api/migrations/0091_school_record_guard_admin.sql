-- 야누스 생기부 가드 스텝3 (지시서 §6 스텝3) — 관리자 콘솔 차단통계·이의 큐.
-- 무취급 원칙(§1-2): 어떤 표에도 파일명·추출텍스트·원본 바이트를 저장하지 않는다.
--   집계·이의 처리에 필요한 메타(사유코드·표면·단계·시각·행위자 id/role)만 기록한다.

-- school_record_block_event: 생기부 감지·정책 차단 1건당 1행(사유 코드별 집계 원천).
--   reason : SR_FILENAME|SR_KEYWORD|SR_VISION|SR_UNSURE|CONSULTING_UPLOAD_DISABLED
--   stage  : filename|keyword|vision|policy (판정을 결정지은 단계, nullable)
--   surface: 차단이 발생한 경로(upload|scores_ocr|consulting_intake|qna_escalation|...)
--   actor_id: 시도한 계정. FK 없음 — 로깅은 최선노력(계정 삭제·경합과 무관하게 보존), 파일명 미기록.
CREATE TABLE IF NOT EXISTS school_record_block_event (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason     text NOT NULL,
  stage      text,
  surface    text NOT NULL DEFAULT 'unknown',
  actor_id   uuid,
  actor_role text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sr_block_event_created_idx ON school_record_block_event (created_at DESC);
CREATE INDEX IF NOT EXISTS sr_block_event_reason_idx  ON school_record_block_event (reason);

-- school_record_appeal: 사용자가 제기한 이의(§4-b 오탐 신고 — 특히 SR_UNSURE). 관리자 큐에서 처리.
--   note: 신고자 본인이 작성한 사유(본인 문장 — 파일 내용 아님). 파일·추출텍스트 미저장.
--   status: open|reviewing|resolved|rejected. resolution: 관리자 처리 메모.
CREATE TABLE IF NOT EXISTS school_record_appeal (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason      text NOT NULL,
  surface     text,
  note        text,
  actor_id    uuid REFERENCES account(id) ON DELETE SET NULL,
  actor_role  text,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','rejected')),
  resolution  text,
  resolved_by uuid REFERENCES account(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sr_appeal_status_idx ON school_record_appeal (status, created_at DESC);
CREATE INDEX IF NOT EXISTS sr_appeal_actor_idx  ON school_record_appeal (actor_id);
