import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { CreditService } from '../src/modules/billing/credit.service';

/**
 * 백로그 M4 통합: 부여분+구매분 혼합 소비 → 취소 환원 시 원래 버킷 복원.
 */
const CENTER = '00000000-0000-4000-8000-0000000000c1';
const STU = '00000000-0000-4000-8000-0000000000d2';
const REF = '00000000-0000-4000-8000-0000000000d1';

describe('M4 환원 버킷 통합', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let credit: CreditService;
  let acctId: string;
  let lotId: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    credit = mod.get(CreditService);

    await prisma.account.deleteMany({ where: { id: STU } });
    await prisma.account.create({
      data: { id: STU, role: 'student' as any, center_id: CENTER, login_id: 'm4_s', pw_hash: 'x', name: 'm4', status: 'approved' as any },
    });
    await prisma.student_profile.create({ data: { account_id: STU, center_id: CENTER } });
    const acct = await prisma.credit_account.create({
      data: { student_id: STU, purchased_balance: 50_000, granted_balance: 10_000 },
    });
    acctId = acct.id;
    const lot = await prisma.weekly_credit_grant.create({
      data: { account_id: acctId, amount: 10_000, remaining: 10_000, expire_at: new Date('2999-01-01'), grade_id: null },
    });
    lotId = lot.id;
  });

  afterAll(async () => {
    await prisma.account.deleteMany({ where: { id: STU } }); // cascade
    await app.close();
  });

  it('혼합 소비(부여 10k+구매 10k) 후 취소 → 부여 lot·구매분 원복', async () => {
    // 20,000 소비: 부여분 만료 임박분(10k) 먼저 → 구매분 10k
    await prisma.$transaction((tx) => credit.consumeWithin(tx, STU, 20_000, { refType: 'booking', refId: REF }));
    let acct = await prisma.credit_account.findUnique({ where: { id: acctId } });
    expect(acct!.granted_balance).toBe(0);
    expect(acct!.purchased_balance).toBe(40_000);
    expect((await prisma.weekly_credit_grant.findUnique({ where: { id: lotId } }))!.remaining).toBe(0);

    // 취소 환원 → 부여 lot(미만료) 복원 + 구매분 복원
    await credit.refund(STU, 20_000, { refType: 'booking', refId: REF });
    acct = await prisma.credit_account.findUnique({ where: { id: acctId } });
    expect(acct!.granted_balance).toBe(10_000); // 부여분 원복
    expect(acct!.purchased_balance).toBe(50_000); // 구매분 원복
    expect((await prisma.weekly_credit_grant.findUnique({ where: { id: lotId } }))!.remaining).toBe(10_000);
  });
});
