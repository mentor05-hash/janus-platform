-- 0013 — teacher_profile.cancel_count (§5-7 랭킹 가중치: 교사 취소 누적 → 순위 하락)
ALTER TABLE teacher_profile ADD COLUMN IF NOT EXISTS cancel_count INTEGER NOT NULL DEFAULT 0;
