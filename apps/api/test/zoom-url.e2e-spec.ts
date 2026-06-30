import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { BookingService } from '../src/modules/booking/booking.service';

/**
 * a2 §9·§10 ZoomProvider: zoom 예약 확정 시 입장 URL(placeholder) 발급·노출.
 */
const TEACHER = '00000000-0000-4000-8000-0000000000a2';
const STUDENT = '00000000-0000-4000-8000-0000000000a1';
const studentUser: any = {
  id: STUDENT,
  role: 'student',
  centerId: '00000000-0000-4000-8000-0000000000c1',
  loginId: 's',
};
const teacherUser: any = {
  id: TEACHER,
  role: 'teacher',
  centerId: '00000000-0000-4000-8000-0000000000c1',
  loginId: 't',
};
const DATE = '2034-06-06';

describe('a2 zoom 입장 URL(§9·§10)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let booking: BookingService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    booking = mod.get(BookingService);
    // 크레딧 충분히 확보
    await prisma.credit_account.update({
      where: { student_id: STUDENT },
      data: { purchased_balance: 1_000_000 },
    });
  });

  const cleanBookings = async () => {
    const rows = await prisma.booking.findMany({
      where: {
        teacher_id: TEACHER,
        start_at: { gte: new Date('2034-06-06T00:00:00Z') },
      },
    });
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      await prisma.time_slot.deleteMany({ where: { booking_id: { in: ids } } });
      await prisma.credit_transaction.deleteMany({
        where: { ref_id: { in: ids } },
      });
      await prisma.booking.deleteMany({ where: { id: { in: ids } } });
    }
  };

  afterAll(async () => {
    await cleanBookings();
    await app.close();
  });

  it('zoom 예약 확정 → 입장 URL 발급', async () => {
    const created: any = await booking.create(
      {
        teacherId: TEACHER,
        date: DATE,
        consultType: '교과',
        mode: 'zoom',
        slotStart: 60,
        slotEnd: 63,
      },
      studentUser,
    );
    expect(created.meetingUrl).toBeNull(); // 생성(new) 단계엔 미발급

    await booking.accept(created.id, teacherUser); // teacher 수락 → confirmed

    const row = await prisma.booking.findUnique({ where: { id: created.id } });
    expect(row?.meeting_url).toBe(`https://meet.local/itall/${created.id}`);
  });
});
