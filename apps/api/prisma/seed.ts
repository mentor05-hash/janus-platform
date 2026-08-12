/**
 * Phase 0 시드 — 더미 데이터만 (CLAUDE.md §5-10 / O13).
 *   허용: 센터·회원등급·요금정책·분류한도·더미 계정(역할별 1).
 *   금지: 실제 학생/보호자 인적사항·상담내용·결제/크레딧 실데이터.
 *
 * pg 클라이언트로 직접 INSERT — Prisma introspection 모델명에 의존하지 않아 견고.
 * 고정 UUID + ON CONFLICT 로 idempotent(반복 실행 안전).
 *
 * 실행: npm run seed   (DATABASE_URL 은 .env 또는 로컬 기본값)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as bcrypt from 'bcryptjs';
import { Client } from 'pg';
import { PRICING_DEFAULTS, CLASSIFY_LIMITS } from '../src/config/constants';
import {
  DEMO_ADMIN_LOGIN_IDS,
  DEMO_ADMIN_PW_ENV,
  DEMO_DEFAULT_PW,
  demoAdminPassword,
  isDemoAdminAccount,
} from '../src/config/demo-admin-accounts';

// .env 의 DATABASE_URL 을 가볍게 로드(ts-node 는 자동 로드 안 함).
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const envPath = join(__dirname, '..', '.env');
    const line = readFileSync(envPath, 'utf8')
      .split('\n')
      .find((l) => l.trim().startsWith('DATABASE_URL='));
    if (line) return line.slice(line.indexOf('=') + 1).trim();
  } catch {
    /* .env 없음 — 로컬 기본값 사용 */
  }
  return 'postgresql://janus:janus_local_pw@localhost:5432/janus';
}

// 결정적 더미 UUID (실데이터 아님 — 시드 식별용). RFC v4 형식(버전 4·variant 8)으로 유효.
const ID = {
  center: '00000000-0000-4000-8000-0000000000c1',
  gradeBasic: '00000000-0000-4000-8000-0000000000f1',
  gradeStd: '00000000-0000-4000-8000-0000000000f2',
  gradePrem: '00000000-0000-4000-8000-0000000000f3',
  gradeVip: '00000000-0000-4000-8000-0000000000f4',
  acStudent: '00000000-0000-4000-8000-0000000000a1',
  acTeacher: '00000000-0000-4000-8000-0000000000a2',
  acAdmin: '00000000-0000-4000-8000-0000000000a3',
  acHr: '00000000-0000-4000-8000-0000000000a4',
  acGuardian: '00000000-0000-4000-8000-0000000000a5',
  acHq: '00000000-0000-4000-8000-0000000000a6',
  acMaster: '00000000-0000-4000-8000-0000000000a7',
  acPaid: '00000000-0000-4000-8000-0000000000a8',
  acPaid2: '00000000-0000-4000-8000-0000000000a9',
  acPaid3: '00000000-0000-4000-8000-0000000000aa',
  acPaid4: '00000000-0000-4000-8000-0000000000ab',
  acPaidAll: '00000000-0000-4000-8000-0000000000ac',
  planStd: '00000000-0000-4000-8000-0000000000b2',
  planPrem: '00000000-0000-4000-8000-0000000000b3',
  planVip: '00000000-0000-4000-8000-0000000000b4',
};

// 더미 계정 공통 개발 비밀번호(로컬 전용). 모든 더미 계정이 이 값으로 로그인.
const DEV_PASSWORD = DEMO_DEFAULT_PW;
const DUMMY_PW_HASH = bcrypt.hashSync(DEV_PASSWORD, 10);

// 관리자 콘솔 계열만 다른 비밀번호로 시드하는 탈출구(공개 데모용). ENV 미설정이면 위 기본값 그대로 —
// CI·로컬은 아무것도 바뀌지 않는다. 근거·주의사항은 src/config/demo-admin-accounts.ts 참조.
const ADMIN_SPLIT_PW = demoAdminPassword();
const ADMIN_PW_HASH = ADMIN_SPLIT_PW ? bcrypt.hashSync(ADMIN_SPLIT_PW, 10) : DUMMY_PW_HASH;

/** 이 계정에 심을 비밀번호 해시. 관리자 계열 + ENV 설정 시에만 분리 해시. */
function pwHashFor(loginId: string): string {
  return ADMIN_SPLIT_PW && isDemoAdminAccount(loginId) ? ADMIN_PW_HASH : DUMMY_PW_HASH;
}

async function main() {
  const client = new Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();
  console.log('▶ seed: connected');

  try {
    await client.query('BEGIN');

    // 1) 센터
    await client.query(
      `INSERT INTO center (id, name, region) VALUES ($1,$2,$3)
       ON CONFLICT (id) DO NOTHING`,
      [ID.center, '강남센터(더미)', '서울'],
    );

    // 2) 회원 등급 4단계. 하위(Basic·Standard)=주간 소멸(use-it-or-lose-it), 상위(Premium·VIP)=월간 풀.
    //    지급량은 유닛 이코노믹스 확정값(배분 60%·소멸 15%·마진 30%, 1크=0.5원): 월 Premium 210k / VIP 350k.
    //    [id, name, tier, grant(주간=주/월간=월), expire_policy, priority]
    // 지급량은 **N23 확정값(O175, 2026-07-26 — D 등급사다리교정)**:
    //   주 Standard 24k / 월 Premium 210k · VIP 380k.
    // 승계값(Standard 30k / VIP 350k)에는 등급 역전이 있었다 — 상위 등급의 세션당 단가가 더 비쌌다.
    // 근거·재현: docs/20_exec/유료_티어_가격_결정_워크시트_v1_2026-07-26.md · ops/pricing-sim.mjs
    // ⚠ 정책값이다. 운영 중 변경은 seed 가 아니라 PATCH /hr/membership-grades/{id} 로 한다
    //   (seed 는 ON CONFLICT DO NOTHING 이라 기존 DB 에 반영되지 않는다 — 마이그레이션 0105 참조).
    const grades: [string, string, number, number, string, number][] = [
      [ID.gradeBasic, 'Basic', 1, 0, 'end_of_week', 0],
      [ID.gradeStd, 'Standard', 2, 24_000, 'end_of_week', 1],
      [ID.gradePrem, 'Premium', 3, 210_000, 'end_of_month', 2],
      [ID.gradeVip, 'VIP', 4, 380_000, 'end_of_month', 3],
    ];
    for (const [id, name, tier, grant, expire, prio] of grades) {
      await client.query(
        `INSERT INTO membership_grade (id, name, tier, weekly_credits, expire_policy, priority)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
        [id, name, tier, grant, expire, prio],
      );
    }

    // 2-1) 구독 플랜(등급 연결, 월간) — 구독 시 학생 등급 결정(§5-3 연동)
    const plans: [string, string, number, string, string][] = [
      [ID.planStd, 'Standard 월간', 49_000, ID.gradeStd, '[]'],
      [ID.planPrem, 'Premium 월간', 89_000, ID.gradePrem, '[]'],
      [ID.planVip, 'VIP 월간', 149_000, ID.gradeVip, '["full"]'], // 구독 번들: 전체 배치표 포함(O74 #3)
    ];
    for (const [id, name, price, gradeId, included] of plans) {
      await client.query(
        `INSERT INTO subscription_plan (id, name, price, billing_cycle, payer, grade_id, included_products)
         VALUES ($1,$2,$3,'monthly','guardian',$4,$5::jsonb)
         ON CONFLICT (id) DO UPDATE SET included_products = EXCLUDED.included_products`,
        [id, name, price, gradeId, included],
      );
    }

    // 3) 요금정책 — 전사 기본(center_id NULL). 단일 소스(§5-2).
    const ph = PRICING_DEFAULTS.perHour;
    const modes: [string, number, number, number | null, number | null, number | null][] = [
      // mode, per_hour, surcharge_pct(S급), board_item, board_general, offline_occupancy
      ['board', ph.board, PRICING_DEFAULTS.sGradeSurchargePct, PRICING_DEFAULTS.boardItemFee, PRICING_DEFAULTS.boardGeneralFee, null],
      ['chat', ph.chat, PRICING_DEFAULTS.sGradeSurchargePct, null, null, null],
      ['zoom', ph.zoom, PRICING_DEFAULTS.sGradeSurchargePct, null, null, null],
      ['hand', ph.hand, PRICING_DEFAULTS.sGradeSurchargePct, null, null, null],
      ['offline', ph.offline, PRICING_DEFAULTS.sGradeSurchargePct, null, null, 0],
    ];
    // 전사 기본은 1회만(중복 방지: 동일 mode + center_id NULL 존재 시 skip)
    for (const [mode, perHour, surcharge, item, general, occ] of modes) {
      const exists = await client.query(
        `SELECT 1 FROM pricing_policy WHERE center_id IS NULL AND mode = $1 LIMIT 1`,
        [mode],
      );
      if (exists.rowCount === 0) {
        await client.query(
          `INSERT INTO pricing_policy
             (center_id, mode, enabled, paid, per_hour, surcharge_pct,
              board_item_fee, board_general_fee, offline_occupancy_fee, paid_consulting_fee)
           VALUES (NULL, $1, true, true, $2, $3, $4, $5, $6, NULL)`,
          [mode, perHour, surcharge, item, general, occ],
        );
      }
    }

    // 4) 한도 정책 — 센터 기본(분류 fit/unfit)
    await client.query(
      `INSERT INTO limit_policy (center_id, reservation_limit, classify_fit_limit, classify_unfit_limit)
       VALUES ($1, NULL, $2, $3) ON CONFLICT (center_id) DO NOTHING`,
      [ID.center, CLASSIFY_LIMITS.fit, CLASSIFY_LIMITS.unfit],
    );

    // 4-1) 급여 기준 — **매출 배분 단일 모델**(O113). 실제 지급에 쓰이는 값은 system_setting 두 키뿐이다.
    //   구 payroll_policy 단가(건당 30,000·Q&A 5,000·시급 12,000·등급수당·자동인센티브)는 급여 산정에서
    //   폐지됐다. 그걸 계속 시드하면 데모 환경에서 폐지 체계가 '살아 있는 것처럼' 보인다 — 시드하지 않는다.
    //   (payroll_policy 테이블 자체는 남는다 — 다른 표시 경로가 아직 참조한다.)
    for (const [key, value] of [
      ['payroll_share_policy', { sharePct: 60 }],
      ['payroll_model_policy', { mode: 'share', base: 2_000_000, incentivePct: 30 }],
    ] as const) {
      await client.query(
        `INSERT INTO system_setting (key, value) VALUES ($1, $2::jsonb)
         ON CONFLICT (key) DO NOTHING`,
        [key, JSON.stringify(value)],
      );
    }

    // 4-2) 선생님 평점 기본값(평균 만족도 표시용) — 미설정 시 등급별 시드
    await client.query(
      `UPDATE teacher_profile SET rating = CASE grade WHEN 'S' THEN 4.9 WHEN 'A' THEN 4.6 WHEN 'B' THEN 4.2 ELSE 4.4 END WHERE rating IS NULL OR rating = 0`,
    );
    // 더미 학생 학년(HR·학부모 표시용)
    await client.query(
      `UPDATE student_profile SET school_grade = '고2' WHERE account_id = $1 AND school_grade IS NULL`,
      [ID.acStudent],
    );

    // 5) 더미 계정(역할별 1) + 프로필
    const accounts: [string, string, string, string][] = [
      [ID.acStudent, 'student', 'student01', '학생더미'],
      [ID.acTeacher, 'teacher', 'teacher01', '선생님더미'],
      [ID.acAdmin, 'admin', 'admin01', '관리자더미'],
      [ID.acHr, 'hr', 'hr01', 'HR더미'],
      [ID.acGuardian, 'guardian', 'guardian01', '학부모더미'],
    ];
    for (const [id, role, loginId, name] of accounts) {
      await client.query(
        `INSERT INTO account (id, role, center_id, login_id, pw_hash, name, status)
         VALUES ($1,$2,$3,$4,$5,$6,'approved')
         ON CONFLICT (id) DO UPDATE SET pw_hash = EXCLUDED.pw_hash, status = 'approved'`,
        [id, role, ID.center, loginId, pwHashFor(loginId), name],
      );
    }

    // teacher_profile
    await client.query(
      `INSERT INTO teacher_profile (account_id, center_id, subjects, sub_subjects, grade, career, teacher_category)
       VALUES ($1,$2,$3,$4,'A','더미 경력','교과') ON CONFLICT (account_id) DO NOTHING`,
      [ID.acTeacher, ID.center, ['수학'], ['미적분']],
    );

    // student_profile
    await client.query(
      `INSERT INTO student_profile (account_id, center_id, membership_grade_id)
       VALUES ($1,$2,$3) ON CONFLICT (account_id) DO NOTHING`,
      [ID.acStudent, ID.center, ID.gradeStd],
    );
    // staff_profile (admin=L3, hr=L2)
    await client.query(
      `INSERT INTO staff_profile (account_id, staff_role, center_id, perm_level)
       VALUES ($1,'운영',$2,'L3') ON CONFLICT (account_id) DO NOTHING`,
      [ID.acAdmin, ID.center],
    );
    await client.query(
      `INSERT INTO staff_profile (account_id, staff_role, center_id, perm_level)
       VALUES ($1,'HR',$2,'L2') ON CONFLICT (account_id) DO NOTHING`,
      [ID.acHr, ID.center],
    );
    // guardian
    await client.query(
      `INSERT INTO guardian (account_id, notify_settings) VALUES ($1,'{}'::jsonb)
       ON CONFLICT (account_id) DO NOTHING`,
      [ID.acGuardian],
    );

    // 5-0) Q&A 데모 선생님(P5 배지 확인용) — 첫응답·만족도가 서로 다른 4명 + 지정 질문 실적.
    //      teacher02(빠름·고평점) / teacher03(보통) / teacher04(느림·저평점) / teacher05(신규·무실적)
    const qnaTeachers: [string, string, string, string[], number | null, number | null][] = [
      ['e2e00000-0000-4000-8000-000000000102', 'teacher02', '김수학', ['수학'], 8, 5],
      ['e2e00000-0000-4000-8000-000000000103', 'teacher03', '이영어', ['영어'], 45, 4],
      ['e2e00000-0000-4000-8000-000000000104', 'teacher04', '박과탐', ['과학'], 200, 3],
      ['e2e00000-0000-4000-8000-000000000105', 'teacher05', '최국어', ['국어'], null, null],
    ];
    for (const [tid, loginId, name, subjects, replyMin, rating] of qnaTeachers) {
      await client.query(
        `INSERT INTO account (id, role, center_id, login_id, pw_hash, name, status)
         VALUES ($1,'teacher',$2,$3,$4,$5,'approved')
         ON CONFLICT (id) DO UPDATE SET pw_hash = EXCLUDED.pw_hash, status = 'approved'`,
        [tid, ID.center, loginId, pwHashFor(loginId), name],
      );
      await client.query(
        `INSERT INTO teacher_profile (account_id, center_id, subjects, grade, career, teacher_category)
         VALUES ($1,$2,$3,'A','데모 경력','교과') ON CONFLICT (account_id) DO NOTHING`,
        [tid, ID.center, subjects],
      );
      if (replyMin == null) continue; // 신규(무실적) 선생님
      // 지정 질문 2건: 접수→첫응답(replyMin분)→해결(+30분), 만족도 rating — 배지 집계의 원천 데이터.
      for (let i = 0; i < 2; i++) {
        const pid = `${tid.slice(0, 28)}a${i}${tid.slice(30)}`; // 선생님 id 파생 고정 uuid(멱등)
        await client.query(
          `INSERT INTO qna_post (id, student_id, subject, scope, assigned_teacher_id, body, status,
                                 created_at, claimed_at, first_reply_at, resolved_at, rating)
           VALUES ($1,$2,$3,'assigned',$4,$5,'resolved',
                   now() - interval '${3 + i} days',
                   now() - interval '${3 + i} days' + interval '${Math.max(1, Math.round(replyMin / 2))} minutes',
                   now() - interval '${3 + i} days' + interval '${replyMin + i * 3} minutes',
                   now() - interval '${3 + i} days' + interval '${replyMin + 30} minutes', $6)
           ON CONFLICT (id) DO NOTHING`,
          [pid, ID.acStudent, subjects[0], tid, `${subjects[0]} 데모 질문 ${i + 1} (SLA 배지 시드)`, rating],
        );
        await client.query(
          `INSERT INTO qna_answer (id, post_id, teacher_id, body, accepted, pay_eligible, created_at)
           VALUES ($1,$2,$3,$4,true,false, now() - interval '${3 + i} days' + interval '${replyMin + i * 3} minutes')
           ON CONFLICT (id) DO NOTHING`,
          [`${tid.slice(0, 28)}b${i}${tid.slice(30)}`, pid, tid, `데모 풀이 답변 ${i + 1}`],
        );
      }
    }

    // 관리자 계층(§iam): L1 마스터 / L2 본사 / L3 센터. 역할은 admin, perm_level 로 계층.
    // 본사(HQ) — admin + 센터 미소속(center_id NULL) + L2.
    await client.query(
      `INSERT INTO account (id, role, center_id, login_id, pw_hash, name, status)
       VALUES ($1,'admin',NULL,'hq01',$2,'본사관리자','approved')
       ON CONFLICT (id) DO UPDATE SET pw_hash = EXCLUDED.pw_hash, center_id = NULL, status='approved'`,
      [ID.acHq, pwHashFor('hq01')],
    );
    await client.query(
      `INSERT INTO staff_profile (account_id, staff_role, center_id, perm_level)
       VALUES ($1,'본사',NULL,'L2') ON CONFLICT (account_id) DO UPDATE SET perm_level='L2', center_id=NULL, staff_role='본사'`,
      [ID.acHq],
    );
    // 마스터 — 전역 최상위(L1).
    await client.query(
      `INSERT INTO account (id, role, center_id, login_id, pw_hash, name, status)
       VALUES ($1,'admin',NULL,'master01',$2,'마스터관리자','approved')
       ON CONFLICT (id) DO UPDATE SET pw_hash = EXCLUDED.pw_hash, center_id = NULL, status='approved'`,
      [ID.acMaster, pwHashFor('master01')],
    );
    await client.query(
      `INSERT INTO staff_profile (account_id, staff_role, center_id, perm_level)
       VALUES ($1,'마스터',NULL,'L1') ON CONFLICT (account_id) DO UPDATE SET perm_level='L1', center_id=NULL, staff_role='마스터'`,
      [ID.acMaster],
    );
    // 유료 결제 회원 데모(O74) — 학생 role(=member 티어) + 상품 권한. 상품 4종을 1:1로 부여해 각 권한 실측.
    //   프로덕션 모델과 동일: 비회원 가입 시 student(member) → 결제 시 entitlement 부여로 유료 해제.
    //   [id, login_id, name]
    const paidAccounts: [string, string, string][] = [
      [ID.acPaid, 'paid01', '유료회원1·전체배치표'],
      [ID.acPaid2, 'paid02', '유료회원2·정시정밀'],
      [ID.acPaid3, 'paid03', '유료회원3·카이로스'],
      [ID.acPaid4, 'paid04', '유료회원4·카이로스+알레아'],
      [ID.acPaidAll, 'paidall', '유료회원ALL·전체배치표+계산기'],
    ];
    // [accountId, product_key, serviceIds] — paidall 은 전체배치표+계산기묶음 2상품 보유(전 서비스 해제).
    const paidGrants: [string, string, string[]][] = [
      [ID.acPaid, 'full', ['baechipyo-full', 'baechipyo-jeongsi']],
      [ID.acPaid2, 'jeongsi', ['baechipyo-jeongsi']],
      [ID.acPaid3, 'kairos', ['kairos']],
      [ID.acPaid4, 'kairos-alea', ['kairos', 'alea']],
      [ID.acPaidAll, 'full', ['baechipyo-full', 'baechipyo-jeongsi']],
      [ID.acPaidAll, 'kairos-alea', ['kairos', 'alea']],
    ];
    for (const [id, loginId, name] of paidAccounts) {
      await client.query(
        `INSERT INTO account (id, role, center_id, login_id, pw_hash, name, status)
         VALUES ($1,'student',$2,$3,$4,$5,'approved')
         ON CONFLICT (id) DO UPDATE SET pw_hash = EXCLUDED.pw_hash, status='approved'`,
        [id, ID.center, loginId, pwHashFor(loginId), name],
      );
      await client.query(
        `INSERT INTO student_profile (account_id, center_id, membership_grade_id)
         VALUES ($1,$2,$3) ON CONFLICT (account_id) DO NOTHING`,
        [id, ID.center, ID.gradeStd],
      );
    }
    // 상품 권한(일회성 기간제·수능시즌 말). service_entitlement 미배포 DB(0065 전)면 건너뜀(시드 전체 실패 방지).
    const hasEnt = await client.query("SELECT to_regclass('public.service_entitlement') IS NOT NULL AS present");
    if (hasEnt.rows[0]?.present) {
      for (const [id, productKey, serviceIds] of paidGrants) {
        await client.query(
          `INSERT INTO service_entitlement (account_id, service_id, product_key, source, expires_at)
           SELECT $1, s, $2, 'seed', TIMESTAMPTZ '2027-01-31 23:59:59+09'
             FROM unnest($3::text[]) AS s
            WHERE NOT EXISTS (
              SELECT 1 FROM service_entitlement e
               WHERE e.account_id = $1 AND e.service_id = s AND e.source = 'seed' AND e.revoked_at IS NULL)`,
          [id, productKey, serviceIds],
        );
      }
    }
    // 크레딧 계좌(학생) — 잔액 0
    await client.query(
      `INSERT INTO credit_account (student_id, purchased_balance, granted_balance, reserved_credits)
       VALUES ($1,0,0,0) ON CONFLICT (student_id) DO NOTHING`,
      [ID.acStudent],
    );

    // 선생님 근무표 — 매일(일~토) 08:00–24:00
    // 데모용으로 일부러 넓다. 좁히면 "저녁에 시험해보려니 예약 자체가 안 된다"가 반복된다
    // (실서비스 기본값이 아니라 데모 시드값이다 — 현실적인 근무표는 seed-sim-schedules.mjs 쪽).
    // env 는 그 시간대에 가능한 상담 모드를 정한다(O119③). 생략하면 consult-modes 의 보수적
    // 기본값 'etc' = ['chat'] 로 해석되어 **데모에서 화상(zoom)·필기공유(hand) 예약 슬롯이 0개**가 된다
    // (교집합이라 선생님·학생 양쪽 다 있어야 한다). 데모는 전 기능을 보여야 하므로 'home'(전 모드).
    const weekdayWindows = (start: string, end: string, env = 'home') =>
      Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [{ start, end, env }]]));
    const wsExists = await client.query(`SELECT 1 FROM work_schedule WHERE teacher_id = $1 LIMIT 1`, [
      ID.acTeacher,
    ]);
    if (wsExists.rowCount === 0) {
      await client.query(
        `INSERT INTO work_schedule (teacher_id, recurring_template, weekly_overrides, pre_book_horizon_days)
         VALUES ($1, $2::jsonb, '[]'::jsonb, 30)`,
        [ID.acTeacher, JSON.stringify(weekdayWindows('08:00', '24:00'))],
      );
    }
    // 학생 체류시간 — 매일 08:00–24:00 (선생님 창과 같게 — 교집합이 좁아지면 슬롯이 사라진다)
    await client.query(`UPDATE student_profile SET stay_time = $2::jsonb WHERE account_id = $1`, [
      ID.acStudent,
      JSON.stringify(weekdayWindows('08:00', '24:00')),
    ]);

    await client.query('COMMIT');
    console.log('✔ seed: 완료 (센터1 · 등급4 · 요금정책5 · 한도1 · 더미계정5)');
    console.log(`  로그인 더미: student01 / teacher01 / admin01 / hr01 / guardian01 (PW: ${DEV_PASSWORD})`);
    if (ADMIN_SPLIT_PW) {
      console.log(
        `  ⚠ 관리자 계열(${DEMO_ADMIN_LOGIN_IDS.join(' / ')})은 ${DEMO_ADMIN_PW_ENV} 값으로 분리 시드됨 — 위 공통 PW 로는 로그인되지 않는다.`,
      );
    }
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('✖ seed 실패:', e);
  process.exit(1);
});
