import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { PayrollService } from '../src/modules/payroll/payroll.service';
import { OpsService } from '../src/modules/ops/ops.service';

/**
 * 2.6 DoD 통합테스트 (실 DB):
 *  - 예상급여: 완료 상담 수 × 단가(ENV 기본 30,000) 산정, 역할 권한 가드.
 *  - 운영 대시보드: 집계 응답 {data, meta} 규약, 관리자/HR 권한.
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

describe('2.6 운영·예상급여 통합', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let payroll: PayrollService;
  let ops: OpsService;
  const bookingIds: string[] = [];
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
    for (let i = 0; i < 2; i++) {
      const b = await prisma.booking.create({
        data: {
          student_id: STUDENT,
          teacher_id: TEACHER_P,
          center_id: CENTER,
          consult_type: 'subject' as any,
          mode: 'zoom' as any,
          status: 'done' as any,
        },
      });
      bookingIds.push(b.id);
    }
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
    await app.close();
  });

  it('예상급여: 완료 2건 × 30,000 = 60,000(확정분)', async () => {
    const r: any = await payroll.estimate(TEACHER_P, teacherUser);
    expect(r.breakdown.doneCases).toBe(2);
    expect(r.confirmedAmount).toBe(60_000);
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

  it('3.4 Q&A 적격(pay_eligible) + 자동 인센티브 합산', async () => {
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
    expect(r.breakdown.qnaAccepted).toBe(1);
    expect(r.incentive).toBe(50_000);
    expect(r.confirmedAmount).toBe(2 * 30_000 + 1 * 5_000 + 50_000); // 115,000
  });

  it('3.4 확정 정산 기록(payroll_estimate)', async () => {
    const r: any = await payroll.settle(TEACHER_P, adminUser);
    expect(r.id).toBeDefined();
    expect(r.confirmedAmount).toBe(115_000);
    const row = await prisma.payroll_estimate.findUnique({
      where: { id: r.id },
    });
    expect(row!.confirmed_amount).toBe(115_000);

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
