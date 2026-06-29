import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { BookingService } from '../src/modules/booking/booking.service';

/**
 * 알림 커버리지 회귀: 상담 신청 → 선생님 알림, 승인 → 학생 알림.
 * (이전엔 NotificationProvider 가 취소 외 어디에도 연결되지 않았음)
 */
const STU = '00000000-0000-4000-8000-0000000000a1';
const TEA = '00000000-0000-4000-8000-0000000000a2';
const C1 = '00000000-0000-4000-8000-0000000000c1';

describe('알림 커버리지(§3 notification)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let booking: BookingService;
  let bid = '';
  const DATE = '2034-09-09';

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    booking = mod.get(BookingService);
    await prisma.credit_account.update({ where: { student_id: STU }, data: { purchased_balance: 1_000_000 } });
    await prisma.notification.deleteMany({ where: { recipient_id: { in: [STU, TEA] }, payload: { path: ['marker'], equals: 'covtest' } } });
  });

  afterAll(async () => {
    if (bid) {
      await prisma.time_slot.deleteMany({ where: { booking_id: bid } });
      await prisma.credit_transaction.deleteMany({ where: { ref_id: bid } });
      await prisma.booking.deleteMany({ where: { id: bid } });
    }
    await app.close();
  });

  const studentUser = { id: STU, role: 'student', centerId: C1, loginId: 'student01' } as any;
  const teacherUser = { id: TEA, role: 'teacher', centerId: C1, loginId: 'teacher01' } as any;

  it('상담 신청 → 선생님 booking_requested 알림', async () => {
    const b: any = await booking.create({ teacherId: TEA, date: DATE, consultType: '교과', mode: 'zoom', slotStart: 60, slotEnd: 63 } as any, studentUser);
    bid = b.id;
    const n = await prisma.notification.findFirst({ where: { recipient_id: TEA, type: 'booking_requested', payload: { path: ['bookingId'], equals: bid } } });
    expect(n).toBeTruthy();
  });

  it('승인 → 학생 booking_confirmed 알림', async () => {
    await booking.accept(bid, teacherUser);
    const n = await prisma.notification.findFirst({ where: { recipient_id: STU, type: 'booking_confirmed', payload: { path: ['bookingId'], equals: bid } } });
    expect(n).toBeTruthy();
  });
});
