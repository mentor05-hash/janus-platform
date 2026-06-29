import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AutopayService } from '../src/modules/billing/autopay.service';

/**
 * a3 §membership·§9 O2 정기결제: 도래 구독을 PgProvider(mock)로 청구 + 다음 결제일 이월,
 * 중복 청구 방지(재실행 시 추가 청구 없음).
 */
const STUDENT = '00000000-0000-4000-8000-0000000000a1';

describe('a3 구독 정기결제(autopay)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let autopay: AutopayService;
  let planId = '';
  let subId = '';
  const dueAt = new Date(Date.now() - 86_400_000); // 어제(도래)

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    autopay = mod.get(AutopayService);

    const plan = await prisma.subscription_plan.create({
      data: { name: 'a3-test-plan', price: 49000, billing_cycle: 'monthly' as any, payer: 'student' as any },
    });
    planId = plan.id;
    const sub = await prisma.student_subscription.create({
      data: { student_id: STUDENT, plan_id: planId, status: 'active', next_billing_at: dueAt },
    });
    subId = sub.id;
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { pg_txn_id: `mock_${subId}:${dueAt.toISOString()}` } });
    await prisma.student_subscription.deleteMany({ where: { id: subId } });
    await prisma.subscription_plan.deleteMany({ where: { id: planId } });
    await app.close();
  });

  it('도래 구독 청구 → 결제 기록 + 다음 결제일 이월', async () => {
    const r = await autopay.runDue(new Date());
    expect(r.charged).toBeGreaterThanOrEqual(1);

    const pay = await prisma.payment.findFirst({ where: { pg_txn_id: `mock_${subId}:${dueAt.toISOString()}` } });
    expect(pay?.status).toBe('done');
    expect(pay?.amount).toBe(49000);
    expect(pay?.target).toBe('구독 정기결제');

    const sub = await prisma.student_subscription.findUnique({ where: { id: subId } });
    expect(sub?.next_billing_at?.getTime()).toBeGreaterThan(dueAt.getTime()); // 이월됨
  });

  it('재실행 시 중복 청구 없음(이미 이월)', async () => {
    const before = await prisma.payment.count({ where: { pg_txn_id: `mock_${subId}:${dueAt.toISOString()}` } });
    await autopay.runDue(new Date());
    const after = await prisma.payment.count({ where: { pg_txn_id: `mock_${subId}:${dueAt.toISOString()}` } });
    expect(after).toBe(before);
  });

  // 회귀: next_billing_at 이 DB측 now() 등으로 마이크로초 정밀도를 가져도 청구돼야 함.
  // (이전엔 선점 조건이 정확한 timestamp 일치라 JS Date(ms) 왕복에서 어긋나 결제가 누락됐음)
  it('마이크로초 정밀도 next_billing_at 도 청구된다', async () => {
    const plan2 = await prisma.subscription_plan.create({
      data: { name: 'a3-precision-plan', price: 39000, billing_cycle: 'monthly' as any, payer: 'student' as any },
    });
    const sub2 = await prisma.student_subscription.create({
      data: { student_id: STUDENT, plan_id: plan2.id, status: 'active' },
    });
    // DB now() 로 마이크로초 정밀도 과거값 주입(JS Date 로 정확히 표현 불가)
    await prisma.$executeRawUnsafe(
      `UPDATE student_subscription SET next_billing_at = now() - interval '1 day' WHERE id = $1::uuid`,
      sub2.id,
    );
    const beforeAt = (await prisma.student_subscription.findUnique({ where: { id: sub2.id } }))!.next_billing_at!;

    await autopay.runDue(new Date());

    const afterAt = (await prisma.student_subscription.findUnique({ where: { id: sub2.id } }))!.next_billing_at!;
    expect(afterAt.getTime()).toBeGreaterThan(beforeAt.getTime()); // 이월됨 = 청구 성공
    const pay = await prisma.payment.findFirst({ where: { pg_txn_id: { startsWith: `mock_${sub2.id}:` } } });
    expect(pay?.status).toBe('done');
    expect(pay?.amount).toBe(39000);

    await prisma.payment.deleteMany({ where: { pg_txn_id: { startsWith: `mock_${sub2.id}:` } } });
    await prisma.student_subscription.deleteMany({ where: { id: sub2.id } });
    await prisma.subscription_plan.deleteMany({ where: { id: plan2.id } });
  });
});
