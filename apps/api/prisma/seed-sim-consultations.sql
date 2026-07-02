-- =====================================================================
-- 상담기록 시드 — 상담 종류별 1000건(담임·교과·입시·심리 = 4000건) done + final 기록.
--   §5-5(완료는 기록 final 선행)을 데이터로 충족: booking.status='done' + consultation_note.save_state='final'.
--   상담기록 종류별 통계(대시보드) 검증용. origin='sim-consult' 멱등(재실행 시 교체, 노트는 cascade).
--   대상: seed-sim-large.sql 의 100선생/1000학생/30센터.
-- =====================================================================
DO $do$
DECLARE
  per_type  INT := 1000;
  ty consult_type; i INT; gs INT := 0;
  t INT; s INT; cix INT; day_off INT; hr INT;
  st TIMESTAMPTZ; en TIMESTAMPTZ;
  tid UUID; sid UUID; cid UUID; bid UUID;
  md consult_mode; cr INT; gvis BOOLEAN;
  types consult_type[] := ARRAY['담임','교과','입시','심리']::consult_type[];
  modes consult_mode[] := ARRAY['chat','zoom','hand','offline']::consult_mode[];
BEGIN
  DELETE FROM booking WHERE origin='sim-consult';  -- 노트는 FK cascade 로 자동 삭제

  FOREACH ty IN ARRAY types LOOP
    FOR i IN 1..per_type LOOP
      gs := gs + 1;
      t   := ((gs * 7)  % 100) + 1;
      s   := ((gs * 13) % 1000) + 1;
      cix := ((t - 1) % 30) + 1;
      tid := ('b0000000-0000-4000-8000-' || lpad(t::text,12,'0'))::uuid;
      sid := ('c0000000-0000-4000-8000-' || lpad(s::text,12,'0'))::uuid;
      cid := ('a0000000-0000-4000-8000-' || lpad(cix::text,12,'0'))::uuid;

      day_off := (gs % 150) + 1;                 -- 1..150일 전(전부 과거 → done)
      hr := 9 + (gs % 12);
      st := date_trunc('day', now()) - (day_off || ' days')::interval + (hr || ' hours')::interval;
      en := st + interval '30 minutes';
      md := modes[(gs % 4) + 1];
      cr := CASE md WHEN 'chat' THEN 9000 WHEN 'zoom' THEN 20000 WHEN 'hand' THEN 12000 ELSE 15000 END;
      gvis := (gs % 5) <> 0;                      -- 20% 는 보호자 비공개

      INSERT INTO booking(student_id,teacher_id,center_id,consult_type,sub_type,mode,
                          direction,start_at,end_at,status,charged_credits,content,origin)
        VALUES (sid,tid,cid,ty,'수학',md,'student',st,en,'done',cr,'CONSULT','sim-consult')
        RETURNING id INTO bid;

      INSERT INTO consultation_note(booking_id,student_id,teacher_id,consult_type,sub_type,
                                    core_summary,memo,homework,future_dir,guardian_visible,save_state,author_id,created_at,updated_at)
        VALUES (bid,sid,tid,ty,'수학',
                ty::text||' 상담 핵심요약 — 목표·현황 점검(시뮬)',
                '내부 메모(비공개): 태도·특이사항',
                '주간 과제: 오답노트·개념정리',
                '향후 방향: 취약단원 보강 → 다음 상담 재점검',
                gvis,'final',tid, st + interval '30 minutes', st + interval '30 minutes');
    END LOOP;
  END LOOP;
END $do$;

SELECT consult_type, count(*) bookings,
       (SELECT count(*) FROM consultation_note n JOIN booking b2 ON b2.id=n.booking_id
        WHERE b2.origin='sim-consult' AND n.consult_type=b.consult_type AND n.save_state='final') final_notes
FROM booking b WHERE origin='sim-consult' GROUP BY consult_type ORDER BY consult_type;
