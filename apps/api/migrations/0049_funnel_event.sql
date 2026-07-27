-- =====================================================================
-- 0049 — funnel_event (간이 전환 계측 · W3·접합계약 C3)
-- 페이지 뷰·CTA 클릭을 자체 로그 테이블로 적재(외부 애널리틱스 도입 전 유일 소스).
-- 핵심 지표: 배치표(page=baechi) → 상담 CTA(cta=consult-reserve) 전환율.
-- 익명 세션 id 기반 — PII 없음. prisma model funnel_event 와 일치.
-- =====================================================================
CREATE TABLE IF NOT EXISTS funnel_event (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page       text NOT NULL,                     -- baechi · consult · …
  event      text NOT NULL,                     -- view · cta
  cta        text,                              -- consult-reserve · signup-upsell …
  session_id text,                              -- 익명 세션 id(localStorage)
  meta       jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_funnel_event_page_event_created ON funnel_event(page, event, created_at);
