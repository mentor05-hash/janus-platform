-- =====================================================================
-- 0003 — report 확장 (Phase 3 fix-6)
-- center_id(센터 스코프, S4) · ai_review(AI 1차 검토 결과 보존).
-- 근거: 코드리뷰 M2(신고 센터 누출)·M3(AI 결과 덮어쓰기).
-- =====================================================================

ALTER TABLE report
  ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES center(id),
  ADD COLUMN IF NOT EXISTS ai_review JSONB;
