-- =====================================================================
-- 0002 — cancellation_event 확장 (Phase 2.1 취소·알림)
-- 발생자(cancelled_by)·대체후보(substitute_candidates) 추가.
-- 근거: 통합스펙 §취소/알림 · CLAUDE.md §5-6 (사유·발생자·대체후보·처리경로).
-- =====================================================================

ALTER TABLE cancellation_event
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES account(id),
  ADD COLUMN IF NOT EXISTS substitute_candidates UUID[] NOT NULL DEFAULT '{}';
