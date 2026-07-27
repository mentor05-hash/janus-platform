-- 0064 — 계산기 유료 경계 도입(결정: 인계명세 §6). 카이로스·알레아 = 별도 유료 서비스.
-- min_tier 'member' → 'paid': 회원=free 티저(블러), 유료(paid)+ = 전체 해제.
-- 현재 tierForRole 상 admin/hr=consultant(≥paid)만 해제, 일반 회원(학생)은 티저.
-- 멱등 UPDATE(0063 이 member/paid 어느 상태든 paid 로 수렴).
UPDATE sso_service SET min_tier = 'paid', updated_at = now()
WHERE id IN ('kairos', 'alea') AND min_tier <> 'paid';
