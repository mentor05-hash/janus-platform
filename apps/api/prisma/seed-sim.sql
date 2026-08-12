-- =====================================================================
-- 시뮬레이션 시드 (시뮬레이션_시나리오_v1.md 1장) — 별도·멱등·더미만(§5-10)
-- 기존 테스트 더미(student01 등)는 건드리지 않고 SC 로스터를 추가한다.
-- 비밀번호 전원 동일(dev-password!). 역할: 센터관리자 = admin + perm_level L3.
-- =====================================================================
DO $do$
DECLARE
  pw    TEXT;
  c1 UUID := '00000000-0000-4000-8000-0000000000c1';
  c2 UUID := '00000000-0000-4000-8000-0000000000c2';
  c3 UUID := '00000000-0000-4000-8000-0000000000c3';
  cal JSONB := (SELECT jsonb_object_agg(d, jsonb_build_array(jsonb_build_object('start','09:00','end','22:00','env','home')))
                FROM unnest(ARRAY['0','1','2','3','4','5','6']) d);
  uid UUID; cen UUID; grd TEXT;
BEGIN
  SELECT pw_hash INTO pw FROM account WHERE login_id='student01';

  -- 센터 3개
  INSERT INTO center(id,name,region) VALUES
    (c1,'강남센터(더미)','강남'),(c2,'분당센터(더미)','분당'),(c3,'잠실센터(더미)','잠실')
  ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, region=EXCLUDED.region;

  -- 관리자: M1(L1) / HQ1·HQ2(L2,센터null) / CA1~6(L3,센터배정)
  INSERT INTO account(id,role,center_id,login_id,pw_hash,name,status) VALUES
    ('00000000-0000-4000-8000-000000000101','admin',NULL,'m1', pw,'마스터관리자','approved'),
    ('00000000-0000-4000-8000-000000000102','admin',NULL,'hq1',pw,'본사관리자1','approved'),
    ('00000000-0000-4000-8000-000000000103','admin',NULL,'hq2',pw,'본사관리자2','approved'),
    ('00000000-0000-4000-8000-000000000111','admin',c1,'ca1',pw,'강남센터관리자1','approved'),
    ('00000000-0000-4000-8000-000000000112','admin',c1,'ca2',pw,'강남센터관리자2','approved'),
    ('00000000-0000-4000-8000-000000000113','admin',c2,'ca3',pw,'분당센터관리자1','approved'),
    ('00000000-0000-4000-8000-000000000114','admin',c2,'ca4',pw,'분당센터관리자2','approved'),
    ('00000000-0000-4000-8000-000000000115','admin',c3,'ca5',pw,'잠실센터관리자1','approved'),
    ('00000000-0000-4000-8000-000000000116','admin',c3,'ca6',pw,'잠실센터관리자2','approved')
  ON CONFLICT(id) DO UPDATE SET center_id=EXCLUDED.center_id, status='approved';
  INSERT INTO staff_profile(account_id,staff_role,perm_level,center_id) VALUES
    ('00000000-0000-4000-8000-000000000101','마스터','L1',NULL),
    ('00000000-0000-4000-8000-000000000102','본사','L2',NULL),
    ('00000000-0000-4000-8000-000000000103','본사','L2',NULL),
    ('00000000-0000-4000-8000-000000000111','센터','L3',c1),
    ('00000000-0000-4000-8000-000000000112','센터','L3',c1),
    ('00000000-0000-4000-8000-000000000113','센터','L3',c2),
    ('00000000-0000-4000-8000-000000000114','센터','L3',c2),
    ('00000000-0000-4000-8000-000000000115','센터','L3',c3),
    ('00000000-0000-4000-8000-000000000116','센터','L3',c3)
  ON CONFLICT(account_id) DO UPDATE SET perm_level=EXCLUDED.perm_level, center_id=EXCLUDED.center_id;

  -- 선생님 T1~T10 (C1:1-4, C2:5-7, C3:8-10; S급=1,5,8)
  FOR i IN 1..10 LOOP
    uid := ('00000000-0000-4000-8000-0000000002' || lpad(i::text,2,'0'))::uuid;
    cen := CASE WHEN i<=4 THEN c1 WHEN i<=7 THEN c2 ELSE c3 END;
    grd := CASE WHEN i IN (1,5,8) THEN 'S' ELSE 'A' END;
    INSERT INTO account(id,role,center_id,login_id,pw_hash,name,status)
      VALUES (uid,'teacher',cen,'t'||i,pw,'시뮬쌤'||i,'approved')
      ON CONFLICT(id) DO UPDATE SET center_id=EXCLUDED.center_id, status='approved';
    INSERT INTO teacher_profile(account_id,center_id,subjects,sub_subjects,grade,career,teacher_category,type_code)
      VALUES (uid,cen,ARRAY['수학'],ARRAY['대수'],grd::teacher_grade_t,'경력','교과',
              CASE WHEN i IN (1,5,8) THEN 'consultant' ELSE 'fulltime' END)
      ON CONFLICT(account_id) DO UPDATE SET grade=EXCLUDED.grade, center_id=EXCLUDED.center_id, type_code=EXCLUDED.type_code;
    DELETE FROM work_schedule WHERE teacher_id=uid;
    INSERT INTO work_schedule(teacher_id,recurring_template) VALUES (uid, cal);
    INSERT INTO zoom_policy(center_id,concurrent_limit) VALUES (cen,6) ON CONFLICT(center_id) DO NOTHING;
  END LOOP;

  -- 학생 S1~S20 (C1:1-8, C2:9-14, C3:15-20; 재원=1-15, 외부=16-20)
  FOR i IN 1..20 LOOP
    uid := ('00000000-0000-4000-8000-0000000003' || lpad(i::text,2,'0'))::uuid;
    cen := CASE WHEN i<=8 THEN c1 WHEN i<=14 THEN c2 ELSE c3 END;
    INSERT INTO account(id,role,center_id,login_id,pw_hash,name,status)
      VALUES (uid,'student',cen,'s'||i,pw,'시뮬학생'||i,'approved')
      ON CONFLICT(id) DO UPDATE SET center_id=EXCLUDED.center_id, status='approved';
    INSERT INTO student_profile(account_id,center_id,stay_time,type_code)
      VALUES (uid,cen,cal, CASE WHEN i<=15 THEN 'enrolled' ELSE 'external' END)
      ON CONFLICT(account_id) DO UPDATE SET stay_time=EXCLUDED.stay_time, center_id=EXCLUDED.center_id, type_code=EXCLUDED.type_code;
    INSERT INTO credit_account(id,student_id,purchased_balance,granted_balance,reserved_credits)
      VALUES (gen_random_uuid(),uid,100000,0,0) ON CONFLICT(student_id) DO UPDATE SET purchased_balance=100000, granted_balance=0, reserved_credits=0;
  END LOOP;

  -- 학부모 G1~G15 (G1-8 C1, G9-14 C2, G15 C3)
  FOR i IN 1..15 LOOP
    uid := ('00000000-0000-4000-8000-0000000004' || lpad(i::text,2,'0'))::uuid;
    cen := CASE WHEN i<=8 THEN c1 WHEN i<=14 THEN c2 ELSE c3 END;
    INSERT INTO account(id,role,center_id,login_id,pw_hash,name,status)
      VALUES (uid,'guardian',cen,'g'||i,pw,'시뮬학부모'||i,'approved')
      ON CONFLICT(id) DO UPDATE SET center_id=EXCLUDED.center_id, status='approved';
    INSERT INTO guardian(account_id) VALUES (uid) ON CONFLICT(account_id) DO NOTHING;
  END LOOP;

  -- 연결 매트릭스(승인됨): G1->S1,S2 / G2->S3,S4 / G3,G4->S5 / G5,G6->S6 / G7,G8->S7,S8 /
  --   G9,G10->S9,S10 / G11->S11 / G12->S12 / G13->S13 / G14->S14 / G15->S15 (S16-20 보호자없음)
  INSERT INTO guardian_student_link(guardian_id, student_id, relation, status, link_method)
  SELECT ('00000000-0000-4000-8000-0000000004'||lpad(g::text,2,'0'))::uuid,
         ('00000000-0000-4000-8000-0000000003'||lpad(s::text,2,'0'))::uuid,
         '부','approved','시드'
  FROM (VALUES (1,1),(1,2),(2,3),(2,4),(3,5),(4,5),(5,6),(6,6),(7,7),(7,8),(8,7),(8,8),
               (9,9),(9,10),(10,9),(10,10),(11,11),(12,12),(13,13),(14,14),(15,15)) AS m(g,s)
  ON CONFLICT (guardian_id, student_id) DO NOTHING;

  -- 정책(SC-12): 센터별 penalty/limit
  INSERT INTO penalty_policy(center_id,cancel_threshold,noshow_threshold,reject_threshold,restrict_minutes,ranking_weight_down)
    VALUES (c1,3,2,5,60,0.3),(c2,3,2,5,60,0.3),(c3,3,2,5,60,0.3)
    ON CONFLICT(center_id) DO UPDATE SET noshow_threshold=EXCLUDED.noshow_threshold, cancel_threshold=EXCLUDED.cancel_threshold, restrict_minutes=EXCLUDED.restrict_minutes;
  INSERT INTO limit_policy(center_id,classify_fit_limit,classify_unfit_limit)
    VALUES (c1,10,30),(c2,10,30),(c3,10,30) ON CONFLICT(center_id) DO NOTHING;

  -- 상담실(센터별 2개)
  INSERT INTO room(center_id,type,capacity,status)
  SELECT cc,'offline',1,'available' FROM unnest(ARRAY[c1,c2,c3]) cc
  CROSS JOIN generate_series(1,2) n
  WHERE (SELECT count(*) FROM room r WHERE r.center_id=cc) < 2;
END $do$;

SELECT
  (SELECT count(*) FROM account WHERE login_id ~ '^(m1|hq[12]|ca[1-6])$') admins,
  (SELECT count(*) FROM account WHERE login_id ~ '^t([1-9]|10)$') teachers,
  (SELECT count(*) FROM account WHERE login_id ~ '^s([1-9]|1[0-9]|20)$') students,
  (SELECT count(*) FROM account WHERE login_id ~ '^g([1-9]|1[0-5])$') guardians,
  (SELECT count(*) FROM guardian_student_link WHERE link_method='시드') links,
  (SELECT count(*) FROM center) centers;
