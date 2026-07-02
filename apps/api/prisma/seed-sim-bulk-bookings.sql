-- =====================================================================
-- 대량 예약 시드 — 대시보드·통계·피벗을 실데이터 볼륨으로 검증(§5-10 더미만).
-- 1만 건을 최근 6개월~향후 30일에 분산, 상태/유형/방식 분포 + (선생·학생·일) 중복(중복제거 검증)
-- + done 예약 리뷰(만족도). origin='sim-bulk' 마커로 멱등(재실행 시 교체).
-- 대상: seed-sim-large.sql 로 만든 30센터/100선생/1000학생.
-- =====================================================================
DO $do$
DECLARE
  n_bookings INT := 10000;
  gs INT; t INT; s INT; cix INT; day_off INT; hr INT;
  st TIMESTAMPTZ; en TIMESTAMPTZ; is_future BOOL; r INT;
  tid UUID; sid UUID; cid UUID; bid UUID;
  md consult_mode; ct consult_type; cr INT; stt booking_status;
  modes  consult_mode[] := ARRAY['chat','zoom','hand','offline']::consult_mode[];
  types  consult_type[] := ARRAY['교과','담임','입시','심리']::consult_type[];
BEGIN
  -- 멱등: 기존 대량 시드 제거(review 는 booking cascade 로 자동 삭제)
  DELETE FROM booking WHERE origin='sim-bulk';

  FOR gs IN 1..n_bookings LOOP
    t   := ((gs * 7)  % 100) + 1;                 -- 선생 1..100
    s   := ((gs * 13) % 1000) + 1;                -- 학생 1..1000
    cix := ((t - 1) % 30) + 1;                     -- 선생의 센터
    tid := ('b0000000-0000-4000-8000-' || lpad(t::text,12,'0'))::uuid;
    sid := ('c0000000-0000-4000-8000-' || lpad(s::text,12,'0'))::uuid;
    cid := ('a0000000-0000-4000-8000-' || lpad(cix::text,12,'0'))::uuid;

    day_off := (gs % 210) - 30;                    -- -30(미래) .. 179(과거)
    hr := 9 + (gs % 12);                           -- 09..20시
    st := date_trunc('day', now()) - (day_off || ' days')::interval + (hr || ' hours')::interval;
    en := st + interval '30 minutes';
    is_future := st > now();

    md := modes[(gs % 4) + 1];
    ct := types[(gs % 4) + 1];
    cr := CASE md WHEN 'chat' THEN 9000 WHEN 'zoom' THEN 20000 WHEN 'hand' THEN 12000 ELSE 15000 END;

    IF is_future THEN
      stt := (ARRAY['new','confirmed']::booking_status[])[(gs % 2) + 1];
    ELSE
      r := gs % 20;                                -- 과거: 완료60/취소15/노쇼10/거부15
      stt := CASE WHEN r < 12 THEN 'done' WHEN r < 15 THEN 'cancelled'
                  WHEN r < 17 THEN 'noshow' ELSE 'rejected' END::booking_status;
    END IF;

    INSERT INTO booking(student_id,teacher_id,center_id,consult_type,sub_type,mode,
                        direction,start_at,end_at,status,charged_credits,content,origin)
      VALUES (sid,tid,cid,ct,'수학',md,'student',st,en,stt,cr,'BULKSEED','sim-bulk')
      RETURNING id INTO bid;

    -- done 예약 70%: 리뷰(만족도) 부여
    IF stt = 'done' AND (gs % 10) < 7 THEN
      INSERT INTO review(booking_id,student_id,teacher_id,rating_attitude,rating_content,rating_skill,rating_again,done_confirmed,text)
        VALUES (bid,sid,tid, 3+(gs%3), 3+((gs+1)%3), 4+(gs%2), 3+(gs%3), true, '시뮬 리뷰')
        ON CONFLICT (booking_id) DO NOTHING;
    END IF;

    -- 매 7번째: 같은 (선생·학생·일)에 중복 예약 추가 → 피벗 중복제거 검증용
    IF gs % 7 = 0 THEN
      INSERT INTO booking(student_id,teacher_id,center_id,consult_type,sub_type,mode,
                          direction,start_at,end_at,status,charged_credits,content,origin)
        VALUES (sid,tid,cid,ct,'수학',md,'student', st + interval '3 hours', en + interval '3 hours',
                CASE WHEN is_future THEN 'new' ELSE 'cancelled' END::booking_status, cr, 'BULKSEED-DUP','sim-bulk');
    END IF;
  END LOOP;
END $do$;

SELECT status, count(*) FROM booking WHERE origin='sim-bulk' GROUP BY status ORDER BY count(*) DESC;
SELECT 'total', count(*), 'reviews', (SELECT count(*) FROM review r JOIN booking b ON b.id=r.booking_id WHERE b.origin='sim-bulk') FROM booking WHERE origin='sim-bulk';
