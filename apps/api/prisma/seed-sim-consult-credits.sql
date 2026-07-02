-- =====================================================================
-- 상담 크레딧 소비 보완 — 시드 상담(sim-consult, done 4000건)이 charged_credits 만 기록하고
--   실제 차감/거래내역이 없던 것을 실제 소비로 반영(§5-3). 학생 balance 차감 + spend 거래 기록.
--   관례: amount 음수, balance = 차감 후 스냅샷, ref_type='booking'. 학생당 소비 최대 80k < 100k 라 톱업 불필요.
--   description 마커로 멱등(재실행 시 이전 보완분을 되돌리고 다시 적용).
-- =====================================================================
DO $do$
DECLARE r RECORD; bal INT;
BEGIN
  -- 1) 이전 보완분 되돌리기(멱등): 차감했던 금액을 잔액에 복원 후 거래 삭제
  UPDATE credit_account ca
    SET purchased_balance = ca.purchased_balance + undo.amt
  FROM (
    SELECT account_id, sum(-amount) AS amt
    FROM credit_transaction
    WHERE description = '상담 크레딧 차감(시드보완)'
    GROUP BY account_id
  ) undo
  WHERE ca.id = undo.account_id;
  DELETE FROM credit_transaction WHERE description = '상담 크레딧 차감(시드보완)';

  -- 2) 적용: 상담별(학생·시간순)로 잔액 차감 + spend 거래 기록
  FOR r IN
    SELECT b.id, b.charged_credits AS amt, ca.id AS acct
    FROM booking b
    JOIN credit_account ca ON ca.student_id = b.student_id
    WHERE b.origin = 'sim-consult' AND b.status = 'done' AND COALESCE(b.charged_credits,0) > 0
    ORDER BY b.student_id, b.created_at, b.id
  LOOP
    UPDATE credit_account SET purchased_balance = purchased_balance - r.amt
      WHERE id = r.acct
      RETURNING purchased_balance + granted_balance INTO bal;
    INSERT INTO credit_transaction(account_id, type, amount, balance, description, ref_type, ref_id)
      VALUES (r.acct, 'spend', -r.amt, bal, '상담 크레딧 차감(시드보완)', 'booking', r.id);
  END LOOP;
END $do$;

SELECT
  (SELECT count(*) FROM credit_transaction WHERE description='상담 크레딧 차감(시드보완)') AS spend_txns,
  (SELECT -sum(amount) FROM credit_transaction WHERE description='상담 크레딧 차감(시드보완)') AS consumed_total,
  (SELECT count(*) FROM credit_account WHERE student_id::text LIKE 'c0000000-%' AND purchased_balance<0) AS negative_accts,
  (SELECT round(avg(purchased_balance)) FROM credit_account WHERE student_id::text LIKE 'c0000000-%') AS avg_balance_after;
