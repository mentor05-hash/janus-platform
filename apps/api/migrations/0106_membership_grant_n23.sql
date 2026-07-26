-- 0106: N23 유료 티어 가격 확정(O175, 2026-07-26 — D 등급사다리교정) 부여량 반영.
--
-- 왜 마이그레이션인가: seed.ts 는 ON CONFLICT DO NOTHING 이라 이미 시드된 DB 에는
-- 새 값이 들어가지 않는다. 수동 단건 SQL 은 금지(CLAUDE.md §10)이므로 코드화된 순서로 적용한다.
--
-- 무엇이 바뀌나: 가격(subscription_plan.price)은 그대로다. 부여량 2개만 움직인다.
--   Standard  30,000 → 24,000 /주
--   VIP      350,000 → 380,000 /월
-- 승계값에는 등급 역전이 있었다 — 부여 기준 세션 단가가 7,518 → 8,476 → 8,514원으로
-- 상위 등급이 더 비쌌다(업그레이드 유인 없음). 근거·재현:
--   docs/20_exec/유료_티어_가격_결정_워크시트_v1_2026-07-26.md · ops/pricing-sim.mjs
--
-- 안전장치: **구값에서만** 옮긴다(WHERE weekly_credits = 구값). 운영자가 이미
-- PATCH /hr/membership-grades/{id} 로 손댔다면 그 값을 덮어쓰지 않는다.
-- 재실행해도 두 번째부터는 0 rows — idempotent.

UPDATE membership_grade
   SET weekly_credits = 24000
 WHERE tier = 2
   AND expire_policy = 'end_of_week'
   AND weekly_credits = 30000;

UPDATE membership_grade
   SET weekly_credits = 380000
 WHERE tier = 4
   AND expire_policy = 'end_of_month'
   AND weekly_credits = 350000;
