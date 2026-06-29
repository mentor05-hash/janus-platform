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
  return 'postgresql://itall:itall_local_pw@localhost:5432/itall';
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
  planStd: '00000000-0000-4000-8000-0000000000b2',
  planPrem: '00000000-0000-4000-8000-0000000000b3',
  planVip: '00000000-0000-4000-8000-0000000000b4',
};

// 더미 계정 공통 개발 비밀번호(로컬 전용). 모든 더미 계정이 이 값으로 로그인.
const DEV_PASSWORD = 'dev-password!';
const DUMMY_PW_HASH = bcrypt.hashSync(DEV_PASSWORD, 10);

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
      [ID.center, '잇올 강남센터(더미)', '서울'],
    );

    // 2) 회원 등급 4단계 (주간 부여 크레딧)
    const grades: [string, string, number, number, number][] = [
      [ID.gradeBasic, 'Basic', 1, 0, 0],
      [ID.gradeStd, 'Standard', 2, 30_000, 1],
      [ID.gradePrem, 'Premium', 3, 60_000, 2],
      [ID.gradeVip, 'VIP', 4, 120_000, 3],
    ];
    for (const [id, name, tier, weekly, prio] of grades) {
      await client.query(
        `INSERT INTO membership_grade (id, name, tier, weekly_credits, expire_policy, priority)
         VALUES ($1,$2,$3,$4,'end_of_week',$5) ON CONFLICT (id) DO NOTHING`,
        [id, name, tier, weekly, prio],
      );
    }

    // 2-1) 구독 플랜(등급 연결, 월간) — 구독 시 학생 등급 결정(§5-3 연동)
    const plans: [string, string, number, string][] = [
      [ID.planStd, 'Standard 월간', 49_000, ID.gradeStd],
      [ID.planPrem, 'Premium 월간', 89_000, ID.gradePrem],
      [ID.planVip, 'VIP 월간', 149_000, ID.gradeVip],
    ];
    for (const [id, name, price, gradeId] of plans) {
      await client.query(
        `INSERT INTO subscription_plan (id, name, price, billing_cycle, payer, grade_id)
         VALUES ($1,$2,$3,'monthly','guardian',$4) ON CONFLICT (id) DO NOTHING`,
        [id, name, price, gradeId],
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
        [id, role, ID.center, loginId, DUMMY_PW_HASH, name],
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
    // 관리자 계층(§iam): L1 마스터 / L2 본사 / L3 센터. 역할은 admin, perm_level 로 계층.
    // 본사(HQ) — admin + 센터 미소속(center_id NULL) + L2.
    await client.query(
      `INSERT INTO account (id, role, center_id, login_id, pw_hash, name, status)
       VALUES ($1,'admin',NULL,'hq01',$2,'본사관리자','approved')
       ON CONFLICT (id) DO UPDATE SET pw_hash = EXCLUDED.pw_hash, center_id = NULL, status='approved'`,
      [ID.acHq, DUMMY_PW_HASH],
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
      [ID.acMaster, DUMMY_PW_HASH],
    );
    await client.query(
      `INSERT INTO staff_profile (account_id, staff_role, center_id, perm_level)
       VALUES ($1,'마스터',NULL,'L1') ON CONFLICT (account_id) DO UPDATE SET perm_level='L1', center_id=NULL, staff_role='마스터'`,
      [ID.acMaster],
    );
    // 크레딧 계좌(학생) — 잔액 0
    await client.query(
      `INSERT INTO credit_account (student_id, purchased_balance, granted_balance, reserved_credits)
       VALUES ($1,0,0,0) ON CONFLICT (student_id) DO NOTHING`,
      [ID.acStudent],
    );

    // 선생님 근무표 — 매일(일~토) 09:00–18:00
    const weekdayWindows = (start: string, end: string) =>
      Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [{ start, end }]]));
    const wsExists = await client.query(`SELECT 1 FROM work_schedule WHERE teacher_id = $1 LIMIT 1`, [
      ID.acTeacher,
    ]);
    if (wsExists.rowCount === 0) {
      await client.query(
        `INSERT INTO work_schedule (teacher_id, recurring_template, weekly_overrides, pre_book_horizon_days)
         VALUES ($1, $2::jsonb, '[]'::jsonb, 30)`,
        [ID.acTeacher, JSON.stringify(weekdayWindows('09:00', '18:00'))],
      );
    }
    // 학생 체류시간 — 매일 09:00–22:00
    await client.query(`UPDATE student_profile SET stay_time = $2::jsonb WHERE account_id = $1`, [
      ID.acStudent,
      JSON.stringify(weekdayWindows('09:00', '22:00')),
    ]);

    await client.query('COMMIT');
    console.log('✔ seed: 완료 (센터1 · 등급4 · 요금정책5 · 한도1 · 더미계정5)');
    console.log(`  로그인 더미: student01 / teacher01 / admin01 / hr01 / guardian01 (PW: ${DEV_PASSWORD})`);
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
