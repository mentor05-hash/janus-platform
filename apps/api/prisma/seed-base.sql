-- =====================================================================
-- seed-base.sql — 기본 더미 데이터(계정·센터·등급·요금정책)
-- seed.ts(ts-node) 산출을 SQL로 덤프 — 런타임 컨테이너(ts-node 없음)에서도
-- psql 로 바로 주입 가능. 더미 로그인: student01/teacher01/admin01/hr01/guardian01
-- master01(마스터)·hq01(본사) 포함 · 공통 비번: dev-password!
-- 사용: docker compose ... exec -T postgres psql -U itall -d itall < prisma/seed-base.sql
-- 이후 필요 시 seed-sim*.sql 로 추가 로스터. 멱등 아님 — 빈 DB 1회 주입 권장.
-- =====================================================================
BEGIN;
SET session_replication_role = replica;  -- FK/트리거 우회(주입 순서 무관)
SELECT pg_catalog.set_config('search_path', '', false);
INSERT INTO public.center VALUES ('00000000-0000-4000-8000-0000000000c1', '강남센터(더미)', '서울', '2026-07-14 07:12:42.116918+00');
INSERT INTO public.account VALUES ('00000000-0000-4000-8000-0000000000a1', 'student', '00000000-0000-4000-8000-0000000000c1', 'student01', '$2b$10$xjpKmilEQBqKdVlc4XAOGuL5nBh7HzyAEWdbVOCctD9AOG/hchESC', '학생더미', 'approved', NULL, NULL, false, false, NULL, NULL, '2026-07-14 07:12:42.116918+00');
INSERT INTO public.account VALUES ('00000000-0000-4000-8000-0000000000a2', 'teacher', '00000000-0000-4000-8000-0000000000c1', 'teacher01', '$2b$10$xjpKmilEQBqKdVlc4XAOGuL5nBh7HzyAEWdbVOCctD9AOG/hchESC', '선생님더미', 'approved', NULL, NULL, false, false, NULL, NULL, '2026-07-14 07:12:42.116918+00');
INSERT INTO public.account VALUES ('00000000-0000-4000-8000-0000000000a3', 'admin', '00000000-0000-4000-8000-0000000000c1', 'admin01', '$2b$10$xjpKmilEQBqKdVlc4XAOGuL5nBh7HzyAEWdbVOCctD9AOG/hchESC', '관리자더미', 'approved', NULL, NULL, false, false, NULL, NULL, '2026-07-14 07:12:42.116918+00');
INSERT INTO public.account VALUES ('00000000-0000-4000-8000-0000000000a4', 'hr', '00000000-0000-4000-8000-0000000000c1', 'hr01', '$2b$10$xjpKmilEQBqKdVlc4XAOGuL5nBh7HzyAEWdbVOCctD9AOG/hchESC', 'HR더미', 'approved', NULL, NULL, false, false, NULL, NULL, '2026-07-14 07:12:42.116918+00');
INSERT INTO public.account VALUES ('00000000-0000-4000-8000-0000000000a5', 'guardian', '00000000-0000-4000-8000-0000000000c1', 'guardian01', '$2b$10$xjpKmilEQBqKdVlc4XAOGuL5nBh7HzyAEWdbVOCctD9AOG/hchESC', '학부모더미', 'approved', NULL, NULL, false, false, NULL, NULL, '2026-07-14 07:12:42.116918+00');
INSERT INTO public.account VALUES ('00000000-0000-4000-8000-0000000000a6', 'admin', NULL, 'hq01', '$2b$10$xjpKmilEQBqKdVlc4XAOGuL5nBh7HzyAEWdbVOCctD9AOG/hchESC', '본사관리자', 'approved', NULL, NULL, false, false, NULL, NULL, '2026-07-14 07:12:42.116918+00');
INSERT INTO public.account VALUES ('00000000-0000-4000-8000-0000000000a7', 'admin', NULL, 'master01', '$2b$10$xjpKmilEQBqKdVlc4XAOGuL5nBh7HzyAEWdbVOCctD9AOG/hchESC', '마스터관리자', 'approved', NULL, NULL, false, false, NULL, NULL, '2026-07-14 07:12:42.116918+00');
INSERT INTO public.membership_grade VALUES ('00000000-0000-4000-8000-0000000000f1', 'Basic', 1, 0, 'end_of_week', 0, true);
INSERT INTO public.membership_grade VALUES ('00000000-0000-4000-8000-0000000000f2', 'Standard', 2, 30000, 'end_of_week', 1, true);
INSERT INTO public.membership_grade VALUES ('00000000-0000-4000-8000-0000000000f3', 'Premium', 3, 210000, 'end_of_month', 2, true);
INSERT INTO public.membership_grade VALUES ('00000000-0000-4000-8000-0000000000f4', 'VIP', 4, 350000, 'end_of_month', 3, true);
INSERT INTO public.teacher_profile VALUES ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c1', '{수학}', '{미적분}', 'A', '더미 경력', NULL, '{}', '{}', '{}', 0.0, 0, NULL, NULL, NULL, NULL, NULL, '교과', NULL, 'on', 0, NULL, NULL);
INSERT INTO public.student_profile VALUES ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '{"0": [{"end": "22:00", "start": "09:00"}], "1": [{"end": "22:00", "start": "09:00"}], "2": [{"end": "22:00", "start": "09:00"}], "3": [{"end": "22:00", "start": "09:00"}], "4": [{"end": "22:00", "start": "09:00"}], "5": [{"end": "22:00", "start": "09:00"}], "6": [{"end": "22:00", "start": "09:00"}]}', '00000000-0000-4000-8000-0000000000f2', NULL, NULL, NULL, NULL, 0, 0, 0, 0, 0, NULL, NULL, NULL, NULL, false, false, NULL, NULL);
INSERT INTO public.credit_account VALUES ('9c64bcea-1004-476c-bd66-f84b7c9ddfcc', '00000000-0000-4000-8000-0000000000a1', 0, 0, NULL, 0);
INSERT INTO public.guardian VALUES ('00000000-0000-4000-8000-0000000000a5', '{}');
INSERT INTO public.limit_policy VALUES ('00000000-0000-4000-8000-0000000000c1', NULL, 10, 30);
INSERT INTO public.payroll_policy VALUES ('07d127f0-bd3e-4cf0-ba4d-1e4d844b9af5', '00000000-0000-4000-8000-0000000000c1', NULL, 'monthly', 30000, 5000, '{"A": 100000, "B": 50000, "C": 0, "S": 200000}', 12000, '{"on": true, "amount": 12000, "minCases": 0, "staleBonus": 8000}');
INSERT INTO public.pricing_policy VALUES ('32d6c16d-3647-4e0e-9fc2-dba11284e210', NULL, 'board', true, true, 12000, 20, 8000, 4000, NULL, NULL, NULL, '2026-07-14 07:12:42.116918+00');
INSERT INTO public.pricing_policy VALUES ('2e5e7741-8cc2-4dc4-adeb-6d2bfbdde931', NULL, 'chat', true, true, 18000, 20, NULL, NULL, NULL, NULL, NULL, '2026-07-14 07:12:42.116918+00');
INSERT INTO public.pricing_policy VALUES ('90f0f9fb-2cdf-4648-81fc-3f775b6bd4ee', NULL, 'zoom', true, true, 40000, 20, NULL, NULL, NULL, NULL, NULL, '2026-07-14 07:12:42.116918+00');
INSERT INTO public.pricing_policy VALUES ('985debbb-0f2f-456a-a159-86f77209dbc6', NULL, 'hand', true, true, 36000, 20, NULL, NULL, NULL, NULL, NULL, '2026-07-14 07:12:42.116918+00');
INSERT INTO public.pricing_policy VALUES ('24a7230e-ac1a-495d-a53d-2dc0d68af7b8', NULL, 'offline', true, true, 30000, 20, NULL, NULL, 0, NULL, NULL, '2026-07-14 07:12:42.116918+00');
INSERT INTO public.staff_profile VALUES ('00000000-0000-4000-8000-0000000000a3', '운영', '00000000-0000-4000-8000-0000000000c1', 'L3');
INSERT INTO public.staff_profile VALUES ('00000000-0000-4000-8000-0000000000a4', 'HR', '00000000-0000-4000-8000-0000000000c1', 'L2');
INSERT INTO public.staff_profile VALUES ('00000000-0000-4000-8000-0000000000a6', '본사', NULL, 'L2');
INSERT INTO public.staff_profile VALUES ('00000000-0000-4000-8000-0000000000a7', '마스터', NULL, 'L1');
INSERT INTO public.subscription_plan VALUES ('00000000-0000-4000-8000-0000000000b2', 'Standard 월간', 49000, 'monthly', 'guardian', '00000000-0000-4000-8000-0000000000f2');
INSERT INTO public.subscription_plan VALUES ('00000000-0000-4000-8000-0000000000b3', 'Premium 월간', 89000, 'monthly', 'guardian', '00000000-0000-4000-8000-0000000000f3');
INSERT INTO public.subscription_plan VALUES ('00000000-0000-4000-8000-0000000000b4', 'VIP 월간', 149000, 'monthly', 'guardian', '00000000-0000-4000-8000-0000000000f4');
INSERT INTO public.work_schedule VALUES ('549ebdf4-70b5-4835-89d1-c786ee3b4d9b', '00000000-0000-4000-8000-0000000000a2', '{"0": [{"end": "18:00", "start": "09:00"}], "1": [{"end": "18:00", "start": "09:00"}], "2": [{"end": "18:00", "start": "09:00"}], "3": [{"end": "18:00", "start": "09:00"}], "4": [{"end": "18:00", "start": "09:00"}], "5": [{"end": "18:00", "start": "09:00"}], "6": [{"end": "18:00", "start": "09:00"}]}', '[]', '[]', 30);
SET session_replication_role = origin;
COMMIT;
