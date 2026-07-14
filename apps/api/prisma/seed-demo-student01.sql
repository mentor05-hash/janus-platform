-- 데모 데이터: student01(=...a1)에 성적·예약(출석)·상담기록·Q&A 한 세트.
-- 목적: 학부모 리포트·격차 리포트가 실제 수치로 채워지게. 멱등(ON CONFLICT DO NOTHING).
-- 계정: student01=...a1 · teacher01=...a2 · center=...c1. (기존 DB에 그대로 psql 로 주입 가능)
BEGIN;

-- 1) 성적(전국누백 2.3, 이과) — janusScore.nb / 격차 리포트 / 학부모 리포트 성적 칩
INSERT INTO score_report (id, student_id, center_id, period, source, placement, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1',
        '00000000-0000-4000-8000-0000000000c1', '2026-06_모평', 'demo',
        '{"gye":"이과","nb":2.3}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

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
