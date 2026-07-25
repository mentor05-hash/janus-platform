import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { PayrollService } from '../src/modules/payroll/payroll.service';
import { OpsService } from '../src/modules/ops/ops.service';

/**
 * 2.6 DoD 통합테스트 (실 DB):
 *  - 예상급여: **매출 배분(share) 단일 모델** — 완료·예정 예약의 크레딧 매출을 원(×CREDIT_WON_RATIO 0.5)으로
 *    환산한 뒤 배분율(기본 60%)을 적용한다. 역할·센터 권한 가드.
 *  - 운영 대시보드: 집계 응답 {data, meta} 규약, 관리자/HR 권한.
 *
 * ⚠ 계약 이력: 원래는 '완료 건수 × 단가 30,000 + Q&A 5,000 + 자동 인센티브 50,000' 이었다.
 *   급여 두 모델을 매출 배분 하나로 통합하면서(payroll.service.ts:371-410) 건당 단가·Q&A 보상·자동
 *   인센티브는 **급여 산정에서 사라졌다**(`incentive: 0`·`incentiveOn: false` 하드코딩).
 *   이 스펙은 그 전 계약에 남아 있어 실패했다 — 기대값을 낮춘 게 아니라 **계약이 바뀐 것**이다(O113 기록).
 */
const CENTER = '00000000-0000-4000-8000-0000000000c1';
const STUDENT = '00000000-0000-4000-8000-0000000000a1';
const TEACHER_P = '00000000-0000-4000-8000-0000000000e6'; // 급여 전용 선생님

const teacherUser: any = {
  id: TEACHER_P,
  role: 'teacher',
  centerId: CENTER,
  loginId: 'pay_t',
};
const studentUser: any = {
  id: STUDENT,
  role: 'student',
  centerId: CENTER,
  loginId: 'student01',
};
const adminUser: any = {
  id: '00000000-0000-4000-8000-0000000000a3',
  role: 'admin',
  centerId: CENTER,
};

/** 급여 계약 상수 — 매출 배분 모델. 예약 2건 × 20,000크레딧 → 원 매출 20,000 → 배분 60% = 12,000원. */
const DONE_CREDITS_EACH = 20_000;
const SHARE_PCT = 60;
const CREDIT_WON = 0.5; // config/constants.ts CREDIT_WON_RATIO
const EXPECTED_CONFIRMED = Math.round(Math.round(2 * DONE_CREDITS_EACH * CREDIT_WON) * SHARE_PCT / 100); // 12,000
const POLICY_KEYS = ['payroll_share_policy', 'payroll_model_policy'] as const;

describe('2.6 운영·예상급여 통합', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let payroll: PayrollService;
  let ops: OpsService;
  const bookingIds: string[] = [];
  const prevPolicies = new Map<string, unknown>();
  let qnaPostId: string | undefined;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    payroll = mod.get(PayrollService);
    ops = mod.get(OpsService);

    // 급여 전용 선생님 + 완료 상담 2건
    await prisma.account.deleteMany({ where: { id: TEACHER_P } });
    await prisma.account.create({
      data: {
        id: TEACHER_P,
        role: 'teacher' as any,
        center_id: CENTER,
        login_id: 'pay_t',
        pw_hash: 'x',
        name: 'pay_t',
        status: 'approved' as any,
      },
    });
    await prisma.teacher_profile.create({
      data: { account_id: TEACHER_P, center_id: CENTER, grade: 'B' as any },
    });
    // 완료 예약 2건 — **charged_credits 를 반드시 지정**한다. 급여가 매출 배분으로 바뀐 뒤로
    // 이 값이 곧 매출이며, 생략하면 schema 의 @default(0) 때문에 매출 0 → 급여 0 이 된다(옛 스펙의 실패 원인).
    for (let i = 0; i < 2; i++) {
      const b = await prisma.booking.create({
        data: {
          student_id: STUDENT,
          teacher_id: TEACHER_P,
          center_id: CENTER,
          consult_type: 'subject' as any,
          mode: 'zoom' as any,
          status: 'done' as any,
          charged_credits: DONE_CREDITS_EACH,
        },
      });
      bookingIds.push(b.id);
    }

    // 배분율·모델을 **고정**한다 — 전역 정책이라 DB 값에 따라 기대 금액이 흔들리면 안 된다.
    // 스냅샷 후 afterAll 에서 원복(원래 없던 키는 삭제)한다.
    for (const key of POLICY_KEYS) {
      const row = await prisma.system_setting.findUnique({ where: { key } });
      prevPolicies.set(key, row ? (row.value as unknown) : null);
    }
    await prisma.system_setting.upsert({
      where: { key: 'payroll_share_policy' },
      create: { key: 'payroll_share_policy', value: { sharePct: SHARE_PCT } },
      update: { value: { sharePct: SHARE_PCT } },
    });
    await prisma.system_setting.upsert({
      where: { key: 'payroll_model_policy' },
      create: { key: 'payroll_model_policy', value: { mode: 'share', base: 2_000_000, incentivePct: 30 } },
      update: { value: { mode: 'share', base: 2_000_000, incentivePct: 30 } },
    });
  });

  afterAll(async () => {
    await prisma.payroll_estimate.deleteMany({
      where: { teacher_id: TEACHER_P },
    });
    if (qnaPostId)
      await prisma.qna_post.deleteMany({ where: { id: qnaPostId } }); // cascade answer
    await prisma.payroll_policy.deleteMany({ where: { center_id: CENTER } });
    await prisma.time_slot.deleteMany({
      where: { booking_id: { in: bookingIds } },
    });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.account.deleteMany({ where: { id: TEACHER_P } });
    // 전역 정책 원복 — 원래 없던 키는 삭제해 제품 기본값(SHARE_DEFAULT·MODEL_DEFAULT)으로 되돌린다.
    for (const [key, value] of prevPolicies) {
      if (value === null) await prisma.system_setting.deleteMany({ where: { key } });
      else await prisma.system_setting.update({ where: { key }, data: { value: value as never } });
    }
    await app.close();
  });

  it('예상급여: 완료 2건 크레딧 매출 → 원 환산(×0.5) → 배분 60% = 12,000(확정분)', async () => {
    const r: any = await payroll.estimate(TEACHER_P, teacherUser);
    // 계약을 breakdown 으로 못박는다 — 모델·배분율·환산비가 바뀌면 여기서 깨져야 한다.
    expect(r.breakdown.model).toBe('share');
    expect(r.breakdown.sharePct).toBe(SHARE_PCT);
    expect(r.breakdown.creditWonRatio).toBe(CREDIT_WON);
    expect(r.breakdown.doneSessions).toBe(2);
    expect(r.breakdown.confirmedCredits).toBe(2 * DONE_CREDITS_EACH);
    expect(r.breakdown.confirmedRevenue).toBe(Math.round(2 * DONE_CREDITS_EACH * CREDIT_WON));
    expect(r.confirmedAmount).toBe(EXPECTED_CONFIRMED);
  });

  it('급여 권한 가드: 타인(학생)은 조회 불가', async () => {
    await expect(payroll.estimate(TEACHER_P, studentUser)).rejects.toThrow();
  });

  it('급여 센터 스코프(H1): 타 센터 관리자는 조회/정산 불가', async () => {
    const otherAdmin: any = {
      id: '00000000-0000-4000-8000-0000000000a3',
      role: 'admin',
      centerId: '00000000-0000-4000-8000-0000000000c2',
    };
    await expect(payroll.estimate(TEACHER_P, otherAdmin)).rejects.toThrow();
    await expect(payroll.settle(TEACHER_P, otherAdmin)).rejects.toThrow();
  });

  it('3.4 Q&A 적격(pay_eligible)은 급여에 반영되지 않는다(매출 배분 단일 모델)', async () => {
    await prisma.payroll_policy.create({
      data: {
        center_id: CENTER,
        per_case_rate: 30_000,
        qna_rate: 5_000,
        auto_incentive: { on: true, minCases: 1, amount: 50_000 } as any,
      },
    });
    const post = await prisma.qna_post.create({
      data: {
        student_id: STUDENT,
        scope: 'open' as any,
        body: 'q',
        status: 'resolved',
      },
    });
    qnaPostId = post.id;
    await prisma.qna_answer.create({
      data: {
        post_id: post.id,
        teacher_id: TEACHER_P,
        body: 'a',
        accepted: true,
        pay_eligible: true,
      },
    });

    const r: any = await payroll.estimate(TEACHER_P, teacherUser);
    // 매출 배분 단일 모델로 통합된 뒤 **Q&A 채택·자동 인센티브는 급여에 반영되지 않는다**.
    // 옛 계약(Q&A 5,000 + 인센티브 50,000 → 115,000)으로 되돌아가지 않도록 여기서 고정한다.
    expect(r.incentive).toBe(0);
    expect(r.incentiveOn).toBe(false);
    expect(r.breakdown.qnaAccepted).toBeUndefined();
    expect(r.confirmedAmount).toBe(EXPECTED_CONFIRMED); // Q&A 채택 전과 동일
  });

  it('3.4 확정 정산 기록(payroll_estimate)', async () => {
    const r: any = await payroll.settle(TEACHER_P, adminUser);
    expect(r.id).toBeDefined();
    expect(r.confirmedAmount).toBe(EXPECTED_CONFIRMED);
    const row = await prisma.payroll_estimate.findUnique({
      where: { id: r.id },
    });
    expect(row!.confirmed_amount).toBe(EXPECTED_CONFIRMED);

    // fix-7 멱등: 같은 기간 재정산해도 중복 행 없음
    await payroll.settle(TEACHER_P, adminUser);
    const count = await prisma.payroll_estimate.count({
      where: { teacher_id: TEACHER_P },
    });
    expect(count).toBe(1);
  });

  it('운영 대시보드: {data, meta} 규약 + 집계', async () => {
    const res: any = await ops.dashboard(adminUser);
    expect(res.data).toBeDefined();
    expect(res.meta).toBeDefined();
    expect(res.meta.scope).toBe('center');
    expect(typeof res.data.activeUsers).toBe('number');
    expect(res.data.doneTotal).toBeGreaterThanOrEqual(2);
  });
});
