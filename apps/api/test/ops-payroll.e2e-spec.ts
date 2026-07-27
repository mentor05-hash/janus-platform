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

/**
 * 급여 계약 상수 — 매출 배분 모델.
 * 이번 달 완료 예약: 20,000 × 2 + 말일 10,000 = 50,000크레딧 → 원 매출 25,000 → 배분 60% = 15,000원.
 * (지난 달 예약 999,999크레딧은 기간 밖이라 섞이지 않아야 한다.)
 */
const DONE_CREDITS_EACH = 20_000;
const LAST_DAY_CREDITS = 10_000;
const SHARE_PCT = 60;
const CREDIT_WON = 0.5; // config/constants.ts CREDIT_WON_RATIO
const THIS_MONTH_CREDITS = 2 * DONE_CREDITS_EACH + LAST_DAY_CREDITS;
const EXPECTED_CONFIRMED = Math.round(
  (Math.round(THIS_MONTH_CREDITS * CREDIT_WON) * SHARE_PCT) / 100,
); // 15,000

/** 기간 픽스처 — periodBounds 와 같은 UTC 월 경계를 쓴다(서버 규약과 어긋나면 테스트가 거짓이 된다). */
const now = new Date();
const thisMonth = (day: number) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, 3, 0, 0));
const lastMonth = (day: number) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, day, 3, 0, 0));
/** 이번 달 말일 **낮 시간** — 옛 경계(말일 00:00 lte)에서 빠졌던 지점. */
const endOfThisMonth = () => {
  const lastDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), lastDate, 12, 0, 0),
  );
};
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
    // 완료 예약 2건 — **charged_credits 와 start_at 을 반드시 지정**한다.
    //   · charged_credits: 매출 배분 모델에서 이 값이 곧 매출(생략하면 @default(0) → 급여 0).
    //   · start_at: 급여는 **기간(start_at 기준)으로 잘린다**(O118). 생략하면 NULL 이라 어느 달에도
    //     귀속되지 않아 급여에서 제외된다 — 옛 스펙은 기간 필터가 없어 이 누락이 드러나지 않았다.
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
          start_at: thisMonth(10 + i), // 이번 달 10·11일
        },
      });
      bookingIds.push(b.id);
    }
    // 지난 달 예약 1건 — **이번 달 급여에 섞이면 안 된다**(회귀 가드).
    const prev = await prisma.booking.create({
      data: {
        student_id: STUDENT,
        teacher_id: TEACHER_P,
        center_id: CENTER,
        consult_type: 'subject' as any,
        mode: 'zoom' as any,
        status: 'done' as any,
        charged_credits: 999_999,
        start_at: lastMonth(15),
      },
    });
    bookingIds.push(prev.id);
    // 이번 달 **말일** 예약 1건 — 옛 경계(`lte 말일 00:00`)에서 통째로 누락됐던 케이스.
    const lastDay = await prisma.booking.create({
      data: {
        student_id: STUDENT,
        teacher_id: TEACHER_P,
        center_id: CENTER,
        consult_type: 'subject' as any,
        mode: 'zoom' as any,
        status: 'done' as any,
        charged_credits: LAST_DAY_CREDITS,
        start_at: endOfThisMonth(),
      },
    });
    bookingIds.push(lastDay.id);

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
      create: {
        key: 'payroll_model_policy',
        value: { mode: 'share', base: 2_000_000, incentivePct: 30 },
      },
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
      if (value === null)
        await prisma.system_setting.deleteMany({ where: { key } });
      else
        await prisma.system_setting.update({
          where: { key },
          data: { value: value as never },
        });
    }
    await app.close();
  });

  it('예상급여: 완료 2건 크레딧 매출 → 원 환산(×0.5) → 배분 60% = 12,000(확정분)', async () => {
    const r: any = await payroll.estimate(TEACHER_P, teacherUser);
    // 계약을 breakdown 으로 못박는다 — 모델·배분율·환산비가 바뀌면 여기서 깨져야 한다.
    expect(r.breakdown.model).toBe('share');
    expect(r.breakdown.sharePct).toBe(SHARE_PCT);
    expect(r.breakdown.creditWonRatio).toBe(CREDIT_WON);
    expect(r.breakdown.doneSessions).toBe(3); // 이번 달 3건(10·11일 + 말일) — 지난 달 1건은 제외
    expect(r.breakdown.confirmedCredits).toBe(THIS_MONTH_CREDITS);
    expect(r.breakdown.confirmedRevenue).toBe(
      Math.round(THIS_MONTH_CREDITS * CREDIT_WON),
    );
    expect(r.confirmedAmount).toBe(EXPECTED_CONFIRMED);
    expect(r.period).toBe(
      `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
    );
  });

  it('기간 격리: 지난 달 예약은 이번 달 급여에 섞이지 않는다(O118)', async () => {
    // 지난 달 예약이 999,999크레딧이므로 누적 산정이면 금액이 폭증한다 — 그게 옛 버그였다.
    const r: any = await payroll.estimate(TEACHER_P, teacherUser);
    expect(r.confirmedCredits ?? r.breakdown.confirmedCredits).toBe(
      THIS_MONTH_CREDITS,
    );
    expect(r.confirmedAmount).toBe(EXPECTED_CONFIRMED);
    // 지난 달을 명시 조회하면 그 달 금액만 나온다.
    const prevLabel = `${now.getUTCFullYear()}-${String(now.getUTCMonth() || 12).padStart(2, '0')}`;
    const prev: any = await payroll.estimate(TEACHER_P, teacherUser, prevLabel);
    expect(prev.period).toBe(prevLabel);
    expect(prev.breakdown.confirmedCredits).toBe(999_999);
  });

  it('말일 예약이 포함된다 — 옛 경계(lte 말일 00:00)에서 통째로 누락됐다', async () => {
    const r: any = await payroll.estimate(TEACHER_P, teacherUser);
    // 말일 크레딧이 빠지면 confirmedCredits 가 2×20,000 으로 줄어든다.
    expect(r.breakdown.confirmedCredits).toBe(THIS_MONTH_CREDITS);
    expect(r.breakdown.confirmedCredits).toBeGreaterThan(2 * DONE_CREDITS_EACH);
  });

  it('예상급여와 명세(payslip)가 같은 기간에 같은 금액을 낸다 — 두 경로 정합(O118)', async () => {
    const est: any = await payroll.estimate(TEACHER_P, teacherUser);
    const slip: any = await payroll.revenueSharePayslip(TEACHER_P, adminUser);
    expect(slip.period).toBe(est.period);
    // payslip 은 완료+예정을 합쳐 매출을 낸다 — 예정이 없으면 확정과 같아야 한다.
    expect(slip.creditRevenue).toBe(
      est.breakdown.confirmedCredits + est.breakdown.upcomingCredits,
    );
    expect(slip.gross).toBe(est.expectedAmount);
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
