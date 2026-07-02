-- =====================================================================
-- 대량 시뮬레이션 시드 — 30센터 / 100선생님 / 1000학생 (부하·스케일 시험용)
-- 멱등(재실행 안전, ON CONFLICT). 더미만(§5-10). login_id 네임스페이스 'l*' 로 기존 시드와 분리.
-- 수량은 아래 상수만 바꾸면 조정됨. 비밀번호는 기존 student01 해시 재사용.
-- =====================================================================
DO $do$
DECLARE
  n_centers  INT := 30;
  n_teachers INT := 100;
  n_students INT := 1000;
  n_guardians INT := 300;
  pw   TEXT;
  cal  JSONB := (SELECT jsonb_object_agg(d, jsonb_build_array(jsonb_build_object('start','09:00','end','22:00')))
                 FROM unnest(ARRAY['0','1','2','3','4','5','6']) d);
  i INT; uid UUID; cen UUID; cidx INT; grd TEXT; tcode TEXT;
BEGIN
  SELECT pw_hash INTO pw FROM account WHERE login_id='student01';
  IF pw IS NULL THEN SELECT pw_hash INTO pw FROM account LIMIT 1; END IF;

  -- 센터 30개 (UUID prefix a) + 센터관리자 1명씩(prefix e) + 정책·줌·상담실
  FOR i IN 1..n_centers LOOP
    cen := ('a0000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid;
    INSERT INTO center(id,name,region) VALUES (cen,'시뮬센터'||i||'(더미)','권역'||((i-1)%5+1))
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name;
    uid := ('e0000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid;
    INSERT INTO account(id,role,center_id,login_id,pw_hash,name,status)
      VALUES (uid,'admin',cen,'lca'||i,pw,'시뮬센터관리자'||i,'approved')
      ON CONFLICT(id) DO UPDATE SET center_id=EXCLUDED.center_id, status='approved';
    INSERT INTO staff_profile(account_id,staff_role,perm_level,center_id)
      VALUES (uid,'센터','L3',cen)
      ON CONFLICT(account_id) DO UPDATE SET perm_level='L3', center_id=EXCLUDED.center_id;
    INSERT INTO zoom_policy(center_id,concurrent_limit) VALUES (cen,6) ON CONFLICT(center_id) DO NOTHING;
    INSERT INTO penalty_policy(center_id,cancel_threshold,noshow_threshold,reject_threshold,restrict_minutes,ranking_weight_down)
      VALUES (cen,3,2,5,60,0.3) ON CONFLICT(center_id) DO NOTHING;
    INSERT INTO limit_policy(center_id,classify_fit_limit,classify_unfit_limit)
      VALUES (cen,10,30) ON CONFLICT(center_id) DO NOTHING;
    INSERT INTO room(center_id,type,capacity,status)
      SELECT cen,'offline',1,'available' FROM generate_series(1,2)
      WHERE (SELECT count(*) FROM room r WHERE r.center_id=cen) < 2;
  END LOOP;

  -- 선생님 100명 (센터 라운드로빈; 5번째마다 S급=consultant)
  FOR i IN 1..n_teachers LOOP
    uid  := ('b0000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid;
    cidx := ((i-1) % n_centers) + 1;
    cen  := ('a0000000-0000-4000-8000-' || lpad(cidx::text,12,'0'))::uuid;
    grd  := CASE WHEN i % 5 = 0 THEN 'S' ELSE 'A' END;
    tcode := CASE WHEN i % 5 = 0 THEN 'consultant' ELSE 'fulltime' END;
    INSERT INTO account(id,role,center_id,login_id,pw_hash,name,status)
      VALUES (uid,'teacher',cen,'lt'||i,pw,'시뮬쌤'||i,'approved')
      ON CONFLICT(id) DO UPDATE SET center_id=EXCLUDED.center_id, status='approved';
    INSERT INTO teacher_profile(account_id,center_id,subjects,sub_subjects,grade,career,teacher_category,type_code,rating)
      VALUES (uid,cen,ARRAY['수학'],ARRAY['대수'],grd::teacher_grade_t,'경력','교과',tcode,
              CASE grd WHEN 'S' THEN 4.9 ELSE 4.5 END)
      ON CONFLICT(account_id) DO UPDATE SET grade=EXCLUDED.grade, center_id=EXCLUDED.center_id, type_code=EXCLUDED.type_code;
    DELETE FROM work_schedule WHERE teacher_id=uid;
    INSERT INTO work_schedule(teacher_id,recurring_template) VALUES (uid, cal);
  END LOOP;

  -- 학생 1000명 (센터 라운드로빈; 크레딧 계좌 각 100,000)
  FOR i IN 1..n_students LOOP
    uid  := ('c0000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid;
    cidx := ((i-1) % n_centers) + 1;
    cen  := ('a0000000-0000-4000-8000-' || lpad(cidx::text,12,'0'))::uuid;
    tcode := CASE WHEN i % 6 = 0 THEN 'external' ELSE 'enrolled' END;
    INSERT INTO account(id,role,center_id,login_id,pw_hash,name,status)
      VALUES (uid,'student',cen,'ls'||i,pw,'시뮬학생'||i,'approved')
      ON CONFLICT(id) DO UPDATE SET center_id=EXCLUDED.center_id, status='approved';
    INSERT INTO student_profile(account_id,center_id,stay_time,type_code)
      VALUES (uid,cen,cal,tcode)
      ON CONFLICT(account_id) DO UPDATE SET stay_time=EXCLUDED.stay_time, center_id=EXCLUDED.center_id, type_code=EXCLUDED.type_code;
    INSERT INTO credit_account(id,student_id,purchased_balance,granted_balance,reserved_credits)
      VALUES (gen_random_uuid(),uid,100000,0,0)
      ON CONFLICT(student_id) DO UPDATE SET purchased_balance=100000, granted_balance=0, reserved_credits=0;
  END LOOP;

  -- 학부모 300명 (학생 i*3 에 1:1 연결)
  FOR i IN 1..n_guardians LOOP
    uid := ('d0000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid;
    cidx := ((i-1) % n_centers) + 1;
    cen  := ('a0000000-0000-4000-8000-' || lpad(cidx::text,12,'0'))::uuid;
    INSERT INTO account(id,role,center_id,login_id,pw_hash,name,status)
      VALUES (uid,'guardian',cen,'lg'||i,pw,'시뮬학부모'||i,'approved')
      ON CONFLICT(id) DO UPDATE SET center_id=EXCLUDED.center_id, status='approved';
    INSERT INTO guardian(account_id) VALUES (uid) ON CONFLICT(account_id) DO NOTHING;
    IF i*3 <= n_students THEN
      INSERT INTO guardian_student_link(guardian_id, student_id, relation, status, link_method)
      VALUES (uid, ('c0000000-0000-4000-8000-'||lpad((i*3)::text,12,'0'))::uuid, '부','approved','시드대량')
      ON CONFLICT (guardian_id, student_id) DO NOTHING;
    END IF;
  END LOOP;
END $do$;

SELECT
  (SELECT count(*) FROM account WHERE login_id ~ '^lca[0-9]+$')  center_admins,
  (SELECT count(*) FROM account WHERE login_id ~ '^lt[0-9]+$')   teachers,
  (SELECT count(*) FROM account WHERE login_id ~ '^ls[0-9]+$')   students,
  (SELECT count(*) FROM account WHERE login_id ~ '^lg[0-9]+$')   guardians,
  (SELECT count(*) FROM center WHERE name LIKE '시뮬센터%')       centers;
