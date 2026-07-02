-- =====================================================================
-- 재수생 이상 모의고사 성적 시드 — 매월 2회 × 5달 = 학생당 10회(§성적).
--   대상: sim external 학생을 재수생/삼수(재수생 이상)로 지정. 국어·수학·영어·탐구1·탐구2 5과목.
--   점수는 달이 갈수록 향상되는 추세(재수생 성적 상승 스토리). note 마커로 멱등.
--   score_report(student_id,period UNIQUE) + score_item(과목·점수·등급).
-- =====================================================================
DO $do$
DECLARE
  subj TEXT[] := ARRAY['국어','수학','영어','탐구1','탐구2'];
  soff INT[]  := ARRAY[0,-4,3,-2,1];
  r RECORD; m INT; rnd INT; ord INT;
  pmonth TEXT; per TEXT; rep UUID; base INT; sc INT; k INT; grd TEXT; whenat TIMESTAMPTZ;
BEGIN
  -- 멱등: 기존 시드 성적 제거(항목은 cascade)
  DELETE FROM score_report WHERE note = '재수생 모의고사(시뮬)';

  FOR r IN
    SELECT account_id, center_id, row_number() OVER (ORDER BY account_id) AS rn
    FROM student_profile
    WHERE type_code = 'external' AND account_id::text LIKE 'c0000000-%'
  LOOP
    ord := r.rn;
    -- 재수생 이상 지정: 5명 중 1명 삼수, 나머지 재수
    UPDATE student_profile SET school_grade = CASE WHEN ord % 5 = 0 THEN '삼수' ELSE '재수' END
      WHERE account_id = r.account_id;

    FOR m IN 0..4 LOOP  -- 최근 5개월(5개월 전 → 1개월 전)
      pmonth := to_char(date_trunc('month', now()) - ((5 - m) || ' months')::interval, 'YYYY-MM');
      FOR rnd IN 1..2 LOOP  -- 매월 2회
        per := pmonth || ' 모의고사 ' || rnd || '회';
        whenat := date_trunc('month', now()) - ((5 - m) || ' months')::interval + ((rnd * 12) || ' days')::interval;
        base := 55 + (ord % 30) + m * 3 + (rnd - 1) * 2;  -- 월별 향상 추세

        INSERT INTO score_report(student_id, center_id, period, exam_type, source, note, created_at, updated_at)
          VALUES (r.account_id, r.center_id, per, '모의', 'manual', '재수생 모의고사(시뮬)', whenat, whenat)
          RETURNING id INTO rep;

        FOR k IN 1..5 LOOP
          sc  := LEAST(100, GREATEST(20, base + soff[k] + ((ord * 7 + k * 13 + m * 5) % 11) - 5));
          grd := CASE WHEN sc >= 90 THEN '1' WHEN sc >= 80 THEN '2' WHEN sc >= 70 THEN '3'
                      WHEN sc >= 60 THEN '4' WHEN sc >= 50 THEN '5' ELSE '6' END;
          INSERT INTO score_item(report_id, subject, score, max_score, grade)
            VALUES (rep, subj[k], sc, 100, grd);
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
END $do$;

SELECT
  (SELECT count(*) FROM student_profile WHERE school_grade IN ('재수','삼수')) AS 재수생이상,
  (SELECT count(*) FROM score_report WHERE note='재수생 모의고사(시뮬)') AS 모의고사_리포트,
  (SELECT count(*) FROM score_item si JOIN score_report sr ON sr.id=si.report_id WHERE sr.note='재수생 모의고사(시뮬)') AS 과목항목,
  (SELECT round(avg(cnt),1) FROM (SELECT count(*) cnt FROM score_report WHERE note='재수생 모의고사(시뮬)' GROUP BY student_id) t) AS 인당_리포트;
