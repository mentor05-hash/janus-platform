-- 이식 메모(O102 → O104): B 0063 을 트렁크 0101 로 리넘버. payload 는 **트렁크 JanusReport 봉투**
-- (gap-report.ts 정본 — 누백/내신등급·target·band 안정~상향·evidence relTier)를 그대로 담는다.
-- B 의 avg per-subject GapPayload 는 담지 않는다(O102: 정본=트렁크).
-- 목적은 '무엇을 언제 산출해 보여줬나'의 append-only 이력 — 조회 접근 감사는 별도 audit_log 가 담당.
-- janus_report — 진단·격차·추천 산출물 표준 규약(docs/janus_report_스키마_v1). append-only 이력.
-- janus_score(입력)와 대칭인 출력 규약. 소비처: 리포트 화면·학부모 주간·수준 진단서(같은 payload 계약).
CREATE TABLE IF NOT EXISTS janus_report (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES student_profile(account_id) ON DELETE CASCADE,
  score_report_id uuid REFERENCES score_report(id) ON DELETE SET NULL,  -- 근거 성적(있으면)
  kind            text NOT NULL DEFAULT 'gap'   CHECK (kind   IN ('gap','diagnosis','weekly')),
  status          text NOT NULL DEFAULT 'final' CHECK (status IN ('draft','final')),
  payload         jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_janus_report_student ON janus_report(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_janus_report_kind    ON janus_report(student_id, kind, created_at DESC);
