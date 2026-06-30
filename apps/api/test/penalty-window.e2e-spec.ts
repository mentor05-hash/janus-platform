import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { BookingService } from '../src/modules/booking/booking.service';

/**
 * b4 §5-7 가중 제한 시간 기반 해제: 당일취소 누적이 임계를 넘어도
 * restrict_minutes 가 지나면 신규 예약이 자동 허용된다.
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
const DATE = '2034-05-05';

const book = (booking: BookingService) =>
  booking.create(
    {
      teacherId: TEACHER,
      date: DATE,
      consultType: '교과',
      mode: 'chat',
      slotStart: 60,
      slotEnd: 63,
    },
    studentUser,
  );

describe('b4 가중 제한 시간 해제(§5-7)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let booking: BookingService;
  let origPolicy: any = null;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    booking = mod.get(BookingService);
    origPolicy = await prisma.penalty_policy.findUnique({
      where: { center_id: CENTER },
    });
    // 당일취소 임계 1, 제한창 30분
    await prisma.penalty_policy.upsert({
      where: { center_id: CENTER },
      update: { cancel_threshold: 1, restrict_minutes: 30 },
      create: { center_id: CENTER, cancel_threshold: 1, restrict_minutes: 30 },
    });
    // 당일취소 5회(임계 초과)
    await prisma.student_profile.update({
      where: { account_id: STUDENT },
      data: { same_day_cancel_count: 5 },
    });
  });

  const cleanBookings = async () => {
    const rows = await prisma.booking.findMany({
      where: {
        teacher_id: TEACHER,
        start_at: { gte: new Date('2034-05-05T00:00:00Z') },
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
    await prisma.student_profile.update({
      where: { account_id: STUDENT },
      data: { same_day_cancel_count: 0, penalty_since: null },
    });
    if (origPolicy) {
      await prisma.penalty_policy.update({
        where: { center_id: CENTER },
        data: {
          cancel_threshold: origPolicy.cancel_threshold,
          restrict_minutes: origPolicy.restrict_minutes,
        },
      });
    } else {
      await prisma.penalty_policy.deleteMany({ where: { center_id: CENTER } });
    }
    await app.close();
  });

  it('제한창 이내(방금 오펜스) → 신규 예약 차단', async () => {
    await prisma.student_profile.update({
      where: { account_id: STUDENT },
      data: { penalty_since: new Date() },
    });
    await expect(book(booking)).rejects.toThrow(/가중 제한/);
  });

  it('제한창 경과(60분 전 오펜스) → 가중 제한 사유로는 미차단', async () => {
    await prisma.student_profile.update({
      where: { account_id: STUDENT },
      data: { penalty_since: new Date(Date.now() - 60 * 60_000) },
    });
    let msg = '';
    try {
      await book(booking);
    } catch (e: any) {
      msg = e?.message ?? '';
    }
    expect(msg).not.toMatch(/가중 제한/);
    await cleanBookings();
  });
});
