-- Q&A 데모 선생님 4명 + SLA 실적 (P5 배지 확인용) — ts-node 불필요, psql 로 직접 실행.
--   docker compose -f docker-compose.full.yml exec -T postgres psql -U janus -d janus < apps/api/prisma/seed-qna-teachers.sql
-- 멱등: login_id 기준(있으면 건너뜀). 비밀번호는 teacher01 과 동일(pw_hash 복사).
-- teacher02 김수학(첫응답 ~8분·★5) / teacher03 이영어(~45분·★4) / teacher04 박과탐(~200분·★3) / teacher05 최국어(신규)

DO $$
DECLARE
  ref_center uuid;
  ref_pw text;
  ref_student uuid;
  t record;
  tid uuid;
  pid uuid;
BEGIN
  SELECT center_id, pw_hash INTO ref_center, ref_pw FROM account WHERE login_id = 'teacher01' LIMIT 1;
  SELECT id INTO ref_student FROM account WHERE login_id = 'student01' LIMIT 1;
  IF ref_pw IS NULL OR ref_student IS NULL THEN
    RAISE EXCEPTION 'teacher01/student01 더미 계정이 없습니다 — 기본 시드를 먼저 실행하세요.';
  END IF;

  FOR t IN SELECT * FROM (VALUES
    ('e2e00000-0000-4000-8000-000000000102'::uuid, 'teacher02', '김수학', '수학', 8,   5),
    ('e2e00000-0000-4000-8000-000000000103'::uuid, 'teacher03', '이영어', '영어', 45,  4),
    ('e2e00000-0000-4000-8000-000000000104'::uuid, 'teacher04', '박과탐', '과학', 200, 3),
    ('e2e00000-0000-4000-8000-000000000105'::uuid, 'teacher05', '최국어', '국어', NULL::int, NULL::int)
  ) AS v(fixed_id, login_id, name, subject, reply_min, rating)
  LOOP
    -- 계정: login_id 기준 멱등(이미 있으면 그 id 재사용)
    SELECT id INTO tid FROM account WHERE login_id = t.login_id;
    IF tid IS NULL THEN
      INSERT INTO account (id, role, center_id, login_id, pw_hash, name, status)
      VALUES (t.fixed_id, 'teacher', ref_center, t.login_id, ref_pw, t.name, 'approved');
      tid := t.fixed_id;
    END IF;

    INSERT INTO teacher_profile (account_id, center_id, subjects, grade, career, teacher_category)
    VALUES (tid, ref_center, ARRAY[t.subject], 'A', '데모 경력', '교과')
    ON CONFLICT (account_id) DO NOTHING;

    -- 실적(지정 질문 2건 해결 + 채택 답변) — 신규 선생님(reply_min NULL)은 생략
    IF t.reply_min IS NOT NULL THEN
      FOR i IN 0..1 LOOP
        pid := overlay(tid::text placing 'a' || i FROM 29 FOR 2)::uuid; -- 선생님 id 파생 고정 uuid(멱등)
        INSERT INTO qna_post (id, student_id, subject, scope, assigned_teacher_id, body, status,
                              created_at, claimed_at, first_reply_at, resolved_at, rating)
        VALUES (pid, ref_student, t.subject, 'assigned', tid,
                t.subject || ' 데모 질문 ' || (i + 1) || ' (SLA 배지 시드)', 'resolved',
                now() - make_interval(days => 3 + i),
                now() - make_interval(days => 3 + i) + make_interval(mins => GREATEST(1, t.reply_min / 2)),
                now() - make_interval(days => 3 + i) + make_interval(mins => t.reply_min + i * 3),
                now() - make_interval(days => 3 + i) + make_interval(mins => t.reply_min + 30), t.rating)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO qna_answer (id, post_id, teacher_id, body, accepted, pay_eligible, created_at)
        VALUES (overlay(tid::text placing 'b' || i FROM 29 FOR 2)::uuid, pid, tid,
                '데모 풀이 답변 ' || (i + 1), true, false,
                now() - make_interval(days => 3 + i) + make_interval(mins => t.reply_min + i * 3))
        ON CONFLICT (id) DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- 확인: 선생님 계정·실적 요약
SELECT a.login_id, a.name,
       (SELECT count(*) FROM qna_post p WHERE p.assigned_teacher_id = a.id AND p.first_reply_at IS NOT NULL) AS answered_posts
FROM account a WHERE a.role = 'teacher' ORDER BY a.login_id;
