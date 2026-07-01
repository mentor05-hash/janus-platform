-- 관리자 감사 로그: 정책·급여·조직·평가 변경 등 민감 조작 기록.
CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid,
  actor_name  text,
  actor_role  text,
  action      text NOT NULL,          -- pricing.update, payroll.settle, org.center.create ...
  target_type text,
  target_id   text,
  summary     text,                   -- 사람이 읽는 한 줄 요약
  meta        jsonb,                  -- 변경 상세(payload 등)
  center_id   uuid,                   -- 센터 스코프(HQ=null → 전사 열람)
  request_id  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_center ON audit_log (center_id);
