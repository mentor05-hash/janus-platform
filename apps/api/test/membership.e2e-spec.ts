import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { MembershipService } from '../src/modules/membership/membership.service';
import { WeeklyGrantService } from '../src/modules/billing/weekly-grant.service';
import { CreditService } from '../src/modules/billing/credit.service';

/**
 * 2.3 DoD 통합테스트 (실 DB):
 * 구독 등급에 따라 월요일 부여량 차등(Standard 30k / Premium 60k) · 일요일 소멸(이월 없음).
 * 전용 테스트 학생 2명 + runGrant 단일 학생 스코프로 격리.
 */
const CENTER = '00000000-0000-4000-8000-0000000000c1';
const PLAN_STD = '00000000-0000-4000-8000-0000000000b2'; // grade Standard(30k)
const PLAN_PREM = '00000000-0000-4000-8000-0000000000b3'; // grade Premium(60k)
const STU_A = '00000000-0000-4000-8000-0000000000e1';
const STU_B = '00000000-0000-4000-8000-0000000000e2';

const userA: any = {
  id: STU_A,
  role: 'student',
  centerId: CENTER,
  loginId: 'mem_test_a',
};
const userB: any = {
  id: STU_B,
  role: 'student',
  centerId: CENTER,
  loginId: 'mem_test_b',
};

describe('2.3 구독·등급·주간부여 통합', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let membership: MembershipService;
  let weeklyGrant: WeeklyGrantService;
  let credit: CreditService;

  /** 등급 id — seed 정본(membership_grade). 본문에 uuid 를 반복해 박지 않는다. */
  const GRADE_STD = '00000000-0000-4000-8000-0000000000f2';
  const GRADE_PREM = '00000000-0000-4000-8000-0000000000f3';

  const NOW = new Date('2026-06-01T00:00:00Z');
  const FUTURE = new Date('2999-01-01T00:00:00Z');

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    membership = mod.get(MembershipService);
    weeklyGrant = mod.get(WeeklyGrantService);
    credit = mod.get(CreditService);

    for (const [id, login] of [
      [STU_A, 'mem_test_a'],
      [STU_B, 'mem_test_b'],
    ] as const) {
      await prisma.account.deleteMany({ where: { id } });
      await prisma.account.create({
        data: {
          id,
          role: 'student' as any,
          center_id: CENTER,
          login_id: login,
          pw_hash: 'x',
          name: login,
          status: 'approved' as any,
        },
      });
      await prisma.student_profile.create({
        data: { account_id: id, center_id: CENTER },
      });
      await prisma.credit_account.create({
        data: { student_id: id, purchased_balance: 0, granted_balance: 0 },
      });
    }
  });

  afterAll(async () => {
    await prisma.account.deleteMany({ where: { id: { in: [STU_A, STU_B] } } }); // cascade 로 프로필·계좌·부여 정리
    await app.close();
  });

  it('구독 → 등급 반영 → 주간부여 등급별 차등 → 소멸', async () => {
    await membership.subscribe(userA, PLAN_STD, NOW);
    await membership.subscribe(userB, PLAN_PREM, NOW);

    // 등급 반영 확인
    const spA = await prisma.student_profile.findUnique({
      where: { account_id: STU_A },
    });
    expect(spA!.membership_grade_id).toBe(GRADE_STD);

    // 주간 부여(단일 학생 스코프)
    await weeklyGrant.runGrant(NOW, STU_A);
    await weeklyGrant.runGrant(NOW, STU_B);
    const aGranted = (await credit.getAccount(STU_A)).grantedBalance;
    const bGranted = (await credit.getAccount(STU_B)).grantedBalance;
    // 지급량은 **membership_grade 레코드에서 도출**한다. 절대값 하드코딩(옛 30k/60k)은 유닛 이코노믹스가
    // 바뀔 때마다 깨졌다 — 실제로 Premium 이 '주간 60k' → '월간 풀 210k' 로 바뀌면서 이 단정이 실패했다.
    // 스펙이 지켜야 할 계약은 금액 그 자체가 아니라 **'등급 설정대로 부여되고 상위가 더 많다'** 다.
    const [gStd, gPrem] = await Promise.all([
      prisma.membership_grade.findUniqueOrThrow({
        where: { id: GRADE_STD },
        select: { weekly_credits: true },
      }),
      prisma.membership_grade.findUniqueOrThrow({
        where: { id: GRADE_PREM },
        select: { weekly_credits: true },
      }),
    ]);
    expect(aGranted).toBe(gStd.weekly_credits); // Standard — 설정대로
    expect(bGranted).toBe(gPrem.weekly_credits); // Premium — 설정대로
    expect(gPrem.weekly_credits).toBeGreaterThan(gStd.weekly_credits); // 등급 차등이 설정 자체에 있어야 한다
    expect(gStd.weekly_credits).toBeGreaterThan(0); // 둘 다 0 이면 위 두 단정이 공허해진다
    expect(bGranted).toBeGreaterThan(aGranted);

    // 소멸(이월 없음)
    await weeklyGrant.runExpire(FUTURE, STU_A);
    await weeklyGrant.runExpire(FUTURE, STU_B);
    expect((await credit.getAccount(STU_A)).grantedBalance).toBe(0);
    expect((await credit.getAccount(STU_B)).grantedBalance).toBe(0);
  });

  it('재구독 시 기존 활성 구독 비활성화', async () => {
    await membership.subscribe(userA, PLAN_PREM, NOW); // Standard → Premium 재구독
    const actives = await prisma.student_subscription.count({
      where: { student_id: STU_A, status: 'active' },
    });
    expect(actives).toBe(1);
    const sp = await prisma.student_profile.findUnique({
      where: { account_id: STU_A },
    });
    expect(sp!.membership_grade_id).toBe(
      '00000000-0000-4000-8000-0000000000f3',
    ); // Premium
  });
});
