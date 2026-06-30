import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { BookingService } from '../src/modules/booking/booking.service';
import { CreditService } from '../src/modules/billing/credit.service';

/**
 * 2.5 DoD 통합테스트 (실 DB):
 *  - 역상담 제안(선생님) → 학생 수락(크레딧 차감·confirmed) / 거절(슬롯 해제·rejected).
 *  - 첫 상담 한정: 성사 상담 후 재제안 차단.
 */
const CENTER = '00000000-0000-4000-8000-0000000000c1';
const TEACHER = '00000000-0000-4000-8000-0000000000a2';
const STU_R = '00000000-0000-4000-8000-0000000000e4'; // 수락+차단
const STU_R2 = '00000000-0000-4000-8000-0000000000e5'; // 거절

const teacherUser: any = {
  id: TEACHER,
  role: 'teacher',
  centerId: CENTER,
  loginId: 'teacher01',
};
const userR: any = {
  id: STU_R,
  role: 'student',
  centerId: CENTER,
  loginId: 'rev_r',
};
const userR2: any = {
  id: STU_R2,
  role: 'student',
  centerId: CENTER,
  loginId: 'rev_r2',
};
const DATE = '2031-05-05';

describe('2.5 역상담 통합', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let booking: BookingService;
  let credit: CreditService;

  async function purgeBookings(where: any) {
    const bs = await prisma.booking.findMany({ where, select: { id: true } });
    const ids = bs.map((b) => b.id);
    if (ids.length) {
      await prisma.time_slot.deleteMany({ where: { booking_id: { in: ids } } });
      await prisma.booking.deleteMany({ where: { id: { in: ids } } });
    }
  }

  async function makeStudent(id: string, login: string) {
    await purgeBookings({ student_id: id });
    await prisma.payment.deleteMany({ where: { payer_account_id: id } });
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

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    booking = mod.get(BookingService);
    credit = mod.get(CreditService);
    await makeStudent(STU_R, 'rev_r');
    await makeStudent(STU_R2, 'rev_r2');
    await credit.charge(STU_R, 50_000);
  });

  afterAll(async () => {
    await purgeBookings({ student_id: { in: [STU_R, STU_R2] } });
    await prisma.payment.deleteMany({
      where: { payer_account_id: { in: [STU_R, STU_R2] } },
    });
    await prisma.account.deleteMany({ where: { id: { in: [STU_R, STU_R2] } } });
    await app.close();
  });

  it('제안 → 학생 수락(크레딧 차감·confirmed)', async () => {
    const before = await credit.getAccount(STU_R);
    const b: any = await booking.proposeReverse(
      {
        studentId: STU_R,
        date: DATE,
        consultType: '교과',
        mode: 'zoom',
        slotStart: 60,
        slotEnd: 63,
      },
      teacherUser,
    );
    expect(b.direction).toBe('reverse');
    expect(b.status).toBe('new');

    const res: any = await booking.respondReverse(b.id, 'accept', userR);
    expect(res.status).toBe('confirmed');
    const after = await credit.getAccount(STU_R);
    expect(after.total).toBe(before.total - 20_000); // zoom 30분
  });

  it('첫 상담 외 재제안 차단(성사 상담 존재)', async () => {
    await expect(
      booking.proposeReverse(
        {
          studentId: STU_R,
          date: DATE,
          consultType: '교과' as any,
          mode: 'zoom' as any,
          slotStart: 80,
          slotEnd: 83,
        } as any,
        teacherUser,
      ),
    ).rejects.toThrow(/첫 상담/);
  });

  it('제안 → 학생 거절(슬롯 해제·rejected)', async () => {
    const b: any = await booking.proposeReverse(
      {
        studentId: STU_R2,
        date: DATE,
        consultType: '교과',
        mode: 'zoom',
        slotStart: 90,
        slotEnd: 93,
      },
      teacherUser,
    );
    expect(await prisma.time_slot.count({ where: { booking_id: b.id } })).toBe(
      3,
    );
    const res: any = await booking.respondReverse(b.id, 'reject', userR2);
    expect(res.status).toBe('rejected');
    expect(await prisma.time_slot.count({ where: { booking_id: b.id } })).toBe(
      0,
    );
  });

  it('역상담 제안(NEW)을 일반 취소해도 환원 없음(미차감, H3 회귀)', async () => {
    const before = await credit.getAccount(STU_R2); // 미충전 → 0
    const b: any = await booking.proposeReverse(
      {
        studentId: STU_R2,
        date: DATE,
        consultType: '교과',
        mode: 'zoom',
        slotStart: 100,
        slotEnd: 103,
      },
      teacherUser,
    );
    const res: any = await booking.cancel(b.id, userR2);
    expect(res.status).toBe('cancelled');
    expect(res.refunded).toBe(0); // 미차감 → 환원 0
    const after = await credit.getAccount(STU_R2);
    expect(after.total).toBe(before.total); // 무료 크레딧 발급 없음
  });
});
