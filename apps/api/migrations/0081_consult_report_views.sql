-- 상담 요약 리포트 학생용/학부모용 2뷰(발송·수신 레이어 브리핑 v1).
-- 원 consult_report(요약 본문)는 무변경 — 뷰는 별 테이블. audience별 검수·공유·열람 상태를 자체 보유.
CREATE TABLE IF NOT EXISTS consult_report_view (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid NOT NULL,           -- → consult_report.id
  audience    text NOT NULL,           -- 'student' | 'guardian'
  body        jsonb NOT NULL,          -- 구조화(학생: covered/reviewPoints/nextLearning · 학부모: progress/recommendedActions/effort)
  status      text NOT NULL DEFAULT 'draft',   -- 'draft' | 'approved'
  approved_by uuid,
  shared_at   timestamptz,             -- 학부모 뷰: 학생 주도 공유 시각(공유 전엔 학부모 미노출 — §5 기본)
  opened_at   timestamptz,             -- audience별 첫 열람
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, audience)
);
CREATE INDEX IF NOT EXISTS idx_consult_report_view_report ON consult_report_view(report_id);
