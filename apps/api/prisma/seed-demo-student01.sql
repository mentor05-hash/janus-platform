-- 데모 데이터: student01(=...a1)에 성적·예약(출석)·상담기록·Q&A 한 세트.
-- 목적: 학부모 리포트·격차 리포트가 실제 수치로 채워지게. 멱등(ON CONFLICT DO NOTHING).
-- 계정: student01=...a1 · teacher01=...a2 · center=...c1. (기존 DB에 그대로 psql 로 주입 가능)
BEGIN;

-- 1) 성적 — 회차 4건. **각 회차가 누백(placement.nb)과 과목 점수(score_item)를 함께 가진다.**
--    왜 여러 건·왜 둘 다인가:
--      · 이전 시드는 회차 1건에 누백만 있고 과목이 없어서 과목별 격차 화면(실행층)이 늘 비었다.
--        반대로 seed-sim-scores 는 과목만 주고 누백이 없다 — 어느 경로도 완전한 회차를 만들지 않았다.
--      · 회차가 1건이면 변동성 판정(O108)이 항상 null 이라 기능이 데모에서 보이지 않는다(2회 미만 → null).
--    누백은 3.1 → 2.6 → 2.45 → 2.3 으로 **꾸준히 향상**(누백은 낮을수록 상위) — 변동성 판정의 'improving'
--    분기가 데모에서 실제로 보이게. period 는 zero-pad 로 **문자열 정렬이 시간순과 일치**해야 한다
--    (janusScore·이력 조회의 정렬 키가 period 다 — '2099-…' 처럼 미래 값을 쓰면 그게 영원히 '최신'이 된다).
--
--    2026-05 는 **표점(std) 모드 자가입력** 회차다(국어·수학·탐구는 표준점수 >100, 영어·한국사·제2외국어는 등급).
--    일부러 남겨 둔 케이스다 — 표점 회차는 ①목표 평균(0~100)과 척도가 달라 과목별 격차를 계산하지 않고
--    (scaleMismatch) ②회차간 평균 범위에서도 제외돼야 한다(척도 혼합 금지). 그 두 가드가 데모에서 실제로 보인다.
--    표점→누백 환산은 **플랫폼이 하지 않는다**(O65 — 배치표 엔진 몫). 이 회차의 nb 는 '배치표에서 점수를
--    적용해 받은 값'을 가정한 데모 값이다.
--    ⚠ 최신 회차는 반드시 **0~100 척도 회차**(2026-06)여야 한다 — 표점 회차가 최신이면 과목별 격차 바가
--      의도대로 숨겨져 데모에서 바를 볼 수 없다.
INSERT INTO score_report (id, student_id, center_id, period, exam_type, source, placement, created_at, updated_at)
VALUES
 ('00000000-0000-4000-8000-0000000000f9', '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000c1', '2026-03_모평', '수능/모의', 'demo',
  '{"gye":"이과","nb":3.1}'::jsonb, now() - interval '120 days', now() - interval '120 days'),
 ('00000000-0000-4000-8000-0000000000fa', '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000c1', '2026-04_학평', '수능/모의', 'demo',
  '{"gye":"이과","nb":2.6}'::jsonb, now() - interval '90 days', now() - interval '90 days'),
 ('00000000-0000-4000-8000-0000000000f0', '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000c1', '2026-05_자가입력(표점)', '수능/모의', 'self',
  '{"gye":"이과","nb":2.45,"nbSource":"배치표 적용(데모)"}'::jsonb, now() - interval '65 days', now() - interval '65 days'),
 ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000c1', '2026-06_모평', '수능/모의', 'demo',
  '{"gye":"이과","nb":2.3}'::jsonb, now() - interval '40 days', now() - interval '40 days')
-- 충돌 기준은 **자연키(student_id, period)** — 앱이 만든 같은 회차가 다른 id 로 이미 있을 수 있고
-- (자가입력 회차가 그렇다), 그때 id 기준 upsert 는 UNIQUE(student_id, period) 위반으로 터진다.
-- DO UPDATE(DO NOTHING 아님): 이미 시드한 DB 도 재실행으로 **보정**되게 한다.
-- created_at 도 함께 보정한다 — **추이(buildTrend)는 created_at, janusScore 는 period 로 정렬**하므로
-- 둘이 어긋나면 '지금 내 위치'(추이 최신)와 '격차 리포트 기준 회차'(period 최신)가 다른 회차를 가리킨다.
-- 앱이 만든 자가입력 회차는 실제 입력 시각이 남아 있어 그대로 두면 항상 마지막으로 밀린다.
ON CONFLICT (student_id, period) DO UPDATE SET
  exam_type = EXCLUDED.exam_type, placement = EXCLUDED.placement,
  created_at = EXCLUDED.created_at, updated_at = now();

-- 과목 점수 — score_item 에는 자연키가 없어 ON CONFLICT 을 쓸 수 없으므로 해당 회차 것만 지우고 다시 넣는다(멱등).
-- report_id 는 **period 로 조회**한다(위와 같은 이유 — 앱이 만든 회차의 id 는 고정값이 아니다).
DELETE FROM score_item WHERE report_id IN (
  SELECT id FROM score_report WHERE student_id = '00000000-0000-4000-8000-0000000000a1'
    AND period IN ('2026-03_모평', '2026-04_학평', '2026-05_자가입력(표점)', '2026-06_모평'));
INSERT INTO score_item (report_id, subject, score, max_score, grade)
SELECT r.id, v.subject, v.score, 100, v.grade
FROM (VALUES
 -- 2026-03: 수학·탐구가 약점(향상 스토리의 출발점)
 ('2026-03_모평', '국어',  82::numeric, '2'),
 ('2026-03_모평', '수학',  71,          '3'),
 ('2026-03_모평', '영어',  88,          '2'),
 ('2026-03_모평', '탐구1', 68,          '4'),
 ('2026-03_모평', '탐구2', 66,          '4'),
 -- 2026-04: 전과목 소폭 상승
 ('2026-04_학평', '국어',  85,          '2'),
 ('2026-04_학평', '수학',  76,          '3'),
 ('2026-04_학평', '영어',  90,          '1'),
 ('2026-04_학평', '탐구1', 72,          '3'),
 ('2026-04_학평', '탐구2', 70,          '3'),
 -- 2026-05: 표점 자가입력 — 국어·수학·탐구는 표준점수(>100), 절대평가 3과목은 등급만(점수 없음)
 ('2026-05_자가입력(표점)', '국어',      131,           NULL),
 ('2026-05_자가입력(표점)', '수학',      135,           NULL),
 ('2026-05_자가입력(표점)', '탐구1',      65,           NULL),
 ('2026-05_자가입력(표점)', '탐구2',      64,           NULL),
 ('2026-05_자가입력(표점)', '영어',      NULL::numeric, '2'),
 ('2026-05_자가입력(표점)', '한국사',    NULL,          '3'),
 ('2026-05_자가입력(표점)', '제2외국어', NULL,          '4'),
 -- 2026-06(최신·0~100 척도): 수학이 여전히 최약점 → '약점 과목 → 할 일 자동 제안'이 실제로 트리거된다
 ('2026-06_모평', '국어',  88,          '2'),
 ('2026-06_모평', '수학',  79,          '2'),
 ('2026-06_모평', '영어',  92,          '1'),
 ('2026-06_모평', '탐구1', 76,          '3'),
 ('2026-06_모평', '탐구2', 74,          '3')
) AS v(period, subject, score, grade)
JOIN score_report r ON r.student_id = '00000000-0000-4000-8000-0000000000a1' AND r.period = v.period;

-- 1-b) 목표 — **없으면 과목별 격차 바도, 약점 기반 할 일 자동 제안도 만들어지지 않는다**(둘 다 goal_avg 의존).
-- 목표 평균 90 vs 최신 평균 81.8 → 격차 8.2, 최약점은 수학(79, 격차 11) → 데모에서 제안이 실제로 뜬다.
UPDATE student_profile
   SET goal_tier = COALESCE(goal_tier, '상위'),
       goal_avg = COALESCE(goal_avg, 90),
       goal_university = COALESCE(goal_university, '나래대'),
       goal_department = COALESCE(goal_department, '데이터과학')
 WHERE account_id = '00000000-0000-4000-8000-0000000000a1';

-- 2) 예약(출석) — 완료 2 · 노쇼 1 · 예정 1 → 출석률 67%. consult_type='교과'(@map), mode='chat'.
INSERT INTO booking (id, student_id, teacher_id, consult_type, mode, status, start_at, end_at, created_at) VALUES
 ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', '교과', 'chat', 'done',      now() - interval '3 days', now() - interval '3 days' + interval '30 min', now() - interval '3 days'),
 ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', '교과', 'chat', 'done',      now() - interval '5 days', now() - interval '5 days' + interval '30 min', now() - interval '5 days'),
 ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', '교과', 'chat', 'noshow',    now() - interval '2 days', now() - interval '2 days' + interval '30 min', now() - interval '2 days'),
 ('00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', '교과', 'chat', 'confirmed', now() + interval '2 days', now() + interval '2 days' + interval '30 min', now())
ON CONFLICT (id) DO NOTHING;

-- 3) 상담기록(완료 예약에 연결) — 학부모 리포트 상담 요약
INSERT INTO consultation_note (id, booking_id, student_id, teacher_id, core_summary, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-0000000000f6', '00000000-0000-4000-8000-0000000000f2',
        '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2',
        '수학 미적분 오답 패턴 점검 — 합성함수 미분 반복 연습 처방', now() - interval '3 days', now() - interval '3 days')
ON CONFLICT (id) DO NOTHING;

-- 4) Q&A(최근 질문 2건) — 학부모 리포트 Q&A 수
INSERT INTO qna_post (id, student_id, subject, difficulty, scope, status, body, created_at) VALUES
 ('00000000-0000-4000-8000-0000000000f7', '00000000-0000-4000-8000-0000000000a1', '수학', '중', 'open', 'open', '미적분 30번 합성함수 미분에서 왜 이렇게 전개되나요?', now() - interval '2 days'),
 ('00000000-0000-4000-8000-0000000000f8', '00000000-0000-4000-8000-0000000000a1', '영어', '하', 'open', 'open', '이 문장에서 관계대명사 which 의 선행사가 무엇인가요?', now() - interval '1 days')
ON CONFLICT (id) DO NOTHING;

COMMIT;
