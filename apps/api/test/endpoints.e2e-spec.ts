import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AvailabilityService } from '../src/modules/availability/availability.service';
import { CreditService } from '../src/modules/billing/credit.service';

/**
 * 잔여 계약 경로: PUT /teachers/{id}/offline-availability · GET /payments/history.
 */
const CENTER = '00000000-0000-4000-8000-0000000000c1';
const TEACHER = '00000000-0000-4000-8000-0000000000a2';
const STU = '00000000-0000-4000-8000-0000000000d3';

describe('잔여 계약 경로', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let availability: AvailabilityService;
  let credit: CreditService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    availability = mod.get(AvailabilityService);
    credit = mod.get(CreditService);
    await prisma.teacher_offline_availability.deleteMany({
      where: { teacher_id: TEACHER },
    });
    await prisma.account.deleteMany({ where: { id: STU } });
    await prisma.account.create({
      data: {
        id: STU,
        role: 'student' as any,
        center_id: CENTER,
        login_id: 'pay_h',
        pw_hash: 'x',
        name: 'p',
        status: 'approved' as any,
      },
    });
    await prisma.student_profile.create({
      data: { account_id: STU, center_id: CENTER },
    });
    await prisma.credit_account.create({
      data: { student_id: STU, purchased_balance: 0, granted_balance: 0 },
    });
  });

  afterAll(async () => {
    await prisma.teacher_offline_availability.deleteMany({
      where: { teacher_id: TEACHER },
    });
    await prisma.payment.deleteMany({ where: { payer_account_id: STU } });
    await prisma.account.deleteMany({ where: { id: STU } });
    await app.close();
  });

  it('오프라인 가용 설정(본인) + 비소유 차단', async () => {
    const teacherSelf: any = { id: TEACHER, role: 'teacher' };
    const r: any = await availability.putOfflineAvailability(
      TEACHER,
      { enabled: true, timeWindows: [] },
      teacherSelf,
    );
    expect(r.enabled).toBe(true);
    const other: any = { id: STU, role: 'teacher' };
    await expect(
      availability.putOfflineAvailability(TEACHER, { enabled: false }, other),
    ).rejects.toThrow();
  });

  it('결제 내역: 충전 후 payments/history 에 기록', async () => {
    await credit.charge(STU, 30000);
    const history = await credit.paymentHistory(STU);
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].amount).toBe(30000);
    expect(history[0].target).toBe('충전');
  });
});
