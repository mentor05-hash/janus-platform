import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { BookingService } from '../src/modules/booking/booking.service';

/**
 * b3 §5-8 줌 동시 진행 한도(ZoomPolicy.concurrent_limit) enforcement.
 * concurrent_limit=0 이면 줌 예약이 차단되고, 한도를 풀면 한도 사유로는 막히지 않는다.
 */
const CENTER = '00000000-0000-4000-8000-0000000000c1';
const TEACHER = '00000000-0000-4000-8000-0000000000a2';
const STUDENT = '00000000-0000-4000-8000-0000000000a1';
const studentUser: any = {
  id: STUDENT,
  role: 'student',
  centerId: CENTER,
  loginId: 'student01',
};
const DATE = '2034-04-04';

const bookZoom = (booking: BookingService) =>
  booking.create(
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

describe('b3 줌 동시 진행 한도(§5-8)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let booking: BookingService;
  let original: number | null = null;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    booking = mod.get(BookingService);
    const zp = await prisma.zoom_policy.findUnique({
      where: { center_id: CENTER },
    });
    original = zp?.concurrent_limit ?? null;
  });

  const cleanBookings = async () => {
    const rows = await prisma.booking.findMany({
      where: {
        teacher_id: TEACHER,
        start_at: { gte: new Date('2034-04-04T00:00:00Z') },
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
    if (original !== null) {
      await prisma.zoom_policy.update({
        where: { center_id: CENTER },
        data: { concurrent_limit: original },
      });
    } else {
      await prisma.zoom_policy.deleteMany({ where: { center_id: CENTER } });
    }
    await app.close();
  });

  const setLimit = (n: number) =>
    prisma.zoom_policy.upsert({
      where: { center_id: CENTER },
      update: { concurrent_limit: n },
      create: { center_id: CENTER, concurrent_limit: n },
    });

  it('concurrent_limit=0 → 줌 예약 차단', async () => {
    await setLimit(0);
    await expect(bookZoom(booking)).rejects.toThrow(/줌/);
  });

  it('한도를 풀면 동시한도 사유로는 막히지 않는다', async () => {
    await setLimit(6);
    let msg = '';
    try {
      await bookZoom(booking);
    } catch (e: any) {
      msg = e?.message ?? '';
    }
    expect(msg).not.toMatch(/동시 진행/);
    await cleanBookings();
  });
});
