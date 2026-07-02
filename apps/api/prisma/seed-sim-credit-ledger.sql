-- =====================================================================
-- 크레딧 원장 정합 시드(통합) — 시드 상담/예약(sim-consult + sim-bulk)의 크레딧 흐름을
--   예약 시점(start_at) 기반 단조 증가 timestamp 로 재구성해, 크레딧 내역이 시간순·잔액 단조로
--   올바르게 표시되도록 한다(§5-3·§5-6). 이전의 동일-timestamp(now) 보완분을 대체.
--   흐름: 완료/예정(done·new·confirmed)=차감, 취소·노쇼·거부=차감 후 환원(net 0).
--   음수 방지 + 최종 잔액 ≥ 50,000: 순소비가 크면 그만큼 '누적 충전' 을 예약 이전 시점에 기록.
--   멱등: 시드 거래(마커) 삭제 + 잔액 100,000 리셋 후 재구성.
-- =====================================================================
DELETE FROM credit_transaction WHERE description IN ('누적 충전(시드)','상담 크레딧 차감(시드)','상담 크레딧 환원(시드)')
  OR description LIKE '%보완%';
UPDATE credit_account SET purchased_balance=100000, granted_balance=0, reserved_credits=0
  WHERE student_id::text LIKE 'c0000000-%';

DO $do$
DECLARE
  r RECORD; bal INT; cur UUID := NULL; seq INT := 0; topup INT; ts TIMESTAMPTZ;
BEGIN
  FOR r IN
    SELECT b.id, b.student_id, b.status::text AS st, b.charged_credits AS amt, ca.id AS acct,
           COALESCE(b.start_at, now()) AS at
    FROM booking b JOIN credit_account ca ON ca.student_id = b.student_id
    WHERE b.origin IN ('sim-consult','sim-bulk') AND COALESCE(b.charged_credits,0) > 0
    ORDER BY b.student_id, b.start_at, b.id
  LOOP
    IF r.student_id IS DISTINCT FROM cur THEN
      cur := r.student_id; seq := 0;
      -- 순소비(환원되지 않는 분)
      SELECT COALESCE(sum(charged_credits),0) INTO topup FROM booking
        WHERE origin IN ('sim-consult','sim-bulk') AND student_id=r.student_id AND status IN ('done','new','confirmed');
      -- 시작 잔액 100,000 에서 최종 ≥ 50,000 이 되도록 부족분만 선충전(예약 이전 시점)
      topup := GREATEST(0, topup - 50000);
      IF topup > 0 THEN
        UPDATE credit_account SET purchased_balance = purchased_balance + topup WHERE id=r.acct
          RETURNING purchased_balance + granted_balance INTO bal;
        INSERT INTO credit_transaction(account_id,type,amount,balance,description,created_at)
          VALUES (r.acct,'charge',topup,bal,'누적 충전(시드)', r.at - interval '1 day');
      END IF;
    END IF;

    seq := seq + 1;
    ts := r.at + (seq * interval '1 minute'); -- 학생 내 단조 증가(동일 timestamp 방지)
    UPDATE credit_account SET purchased_balance = purchased_balance - r.amt WHERE id=r.acct
      RETURNING purchased_balance + granted_balance INTO bal;
    INSERT INTO credit_transaction(account_id,type,amount,balance,description,ref_type,ref_id,created_at)
      VALUES (r.acct,'spend',-r.amt,bal,'상담 크레딧 차감(시드)','booking',r.id, ts);

    IF r.st IN ('cancelled','noshow','rejected') THEN
      seq := seq + 1;
      ts := r.at + (seq * interval '1 minute');
      UPDATE credit_account SET purchased_balance = purchased_balance + r.amt WHERE id=r.acct
        RETURNING purchased_balance + granted_balance INTO bal;
      INSERT INTO credit_transaction(account_id,type,amount,balance,description,ref_type,ref_id,created_at)
        VALUES (r.acct,'refund',r.amt,bal,'상담 크레딧 환원(시드)','booking',r.id, ts);
    END IF;
  END LOOP;
END $do$;

SELECT
  (SELECT count(*) FROM credit_transaction WHERE description='누적 충전(시드)') AS 충전,
  (SELECT count(*) FROM credit_transaction WHERE description='상담 크레딧 차감(시드)') AS 차감,
  (SELECT count(*) FROM credit_transaction WHERE description='상담 크레딧 환원(시드)') AS 환원,
  (SELECT count(*) FROM credit_account WHERE student_id::text LIKE 'c0000000-%' AND purchased_balance<0) AS 음수,
  (SELECT min(purchased_balance) FROM credit_account WHERE student_id::text LIKE 'c0000000-%') AS 최소잔액,
  (SELECT round(avg(purchased_balance)) FROM credit_account WHERE student_id::text LIKE 'c0000000-%') AS 평균잔액;
