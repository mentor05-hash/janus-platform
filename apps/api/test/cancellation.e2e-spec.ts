import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { BookingService } from '../src/modules/booking/booking.service';
import { CancellationService } from '../src/modules/booking/cancellation.service';
import { CreditService } from '../src/modules/billing/credit.service';
import {
  NOTIFICATION_PROVIDER,
  NotifyMessage,
} from '../src/modules/notification/notification.types';

/**
 * 2.1 DoD 통합테스트 (실 DB):
 * 선생님 사유 취소 → CancellationEvent 생성 → 알림 발송(stub) → 크레딧 환원 → 슬롯 해제.
 * 시드 더미(센터/선생님 근무표/학생 체류) 전제. 미래 날짜로 격리, 종료 시 정리.
 */
const CENTER = '00000000-0000-4000-8000-0000000000c1';
const STUDENT = '00000000-0000-4000-8000-0000000000a1';
const TEACHER = '00000000-0000-4000-8000-0000000000a2';
const DATE = '2030-01-16';
const DAY_FLOOR = new Date('2030-01-16T00:00:00Z');

const studentUser: any = {
  id: STUDENT,
  role: 'student',
  centerId: CENTER,
  loginId: 'student01',
};
const teacherUser: any = {
  id: TEACHER,
  role: 'teacher',
  centerId: CENTER,
  loginId: 'teacher01',
};

describe('2.1 취소·알림 통합', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cancellation: CancellationService;
  let booking: BookingService;
  let credit: CreditService;
  const sent: NotifyMessage[] = [];
  const fakeNotifier = { send: async (m: NotifyMessage) => void sent.push(m) };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PROVIDER)
      .useValue(fakeNotifier)
      .compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    cancellation = mod.get(CancellationService);
    booking = mod.get(BookingService);
    credit = mod.get(CreditService);
    {
      // time_slot(자식) → booking 순으로 삭제(FK NO ACTION)
      const olds = await prisma.booking.findMany({
        where: { teacher_id: TEACHER, start_at: { gte: DAY_FLOOR } },
        select: { id: true },
      });
      const ids = olds.map((b) => b.id);
      if (ids.length) {
        await prisma.time_slot.deleteMany({
          where: { booking_id: { in: ids } },
        });
        await prisma.booking.deleteMany({ where: { id: { in: ids } } });
      }
    }
  });

  afterAll(async () => {
    {
      // time_slot(자식) → booking 순으로 삭제(FK NO ACTION)
      const olds = await prisma.booking.findMany({
        where: { teacher_id: TEACHER, start_at: { gte: DAY_FLOOR } },
        select: { id: true },
      });
      const ids = olds.map((b) => b.id);
      if (ids.length) {
        await prisma.time_slot.deleteMany({
          where: { booking_id: { in: ids } },
        });
        await prisma.booking.deleteMany({ where: { id: { in: ids } } });
      }
    }
    await app.close();
  });

  it('선생님 취소 → 이벤트·알림·환원·슬롯해제', async () => {
    await credit.charge(STUDENT, 50_000);
    const before = await credit.getAccount(STUDENT);

    // zoom 10:00–10:30 (슬롯 60–63, 30분 → 20,000)
    const b: any = await booking.create(
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
    const afterBook = await credit.getAccount(STUDENT);
    expect(afterBook.total).toBe(before.total - 20_000);
    expect(await prisma.time_slot.count({ where: { booking_id: b.id } })).toBe(
      3,
    );

    sent.length = 0;
    const res: any = await cancellation.teacherCancel(
      b.id,
      { reason: '개인 사정', route: 'substitute' },
      teacherUser,
    );

    // CancellationEvent
    const ev: any = await prisma.cancellation_event.findFirst({
      where: { booking_id: b.id },
    });
    expect(ev).toBeTruthy();
    expect(ev.cancelled_by).toBe(TEACHER);
    expect(ev.route).toBe('substitute');
    expect(ev.credit_refunded).toBe(20_000);
    expect(res.eventId).toBe(ev.id);

    // 상태 = cancelled
    const bk = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(bk!.status).toBe('cancelled');

    // 슬롯 해제
    expect(await prisma.time_slot.count({ where: { booking_id: b.id } })).toBe(
      0,
    );

    // 크레딧 환원
    const afterCancel = await credit.getAccount(STUDENT);
    expect(afterCancel.total).toBe(afterBook.total + 20_000);

    // 알림 발송(stub) — 학생 포함
    expect(sent.length).toBeGreaterThanOrEqual(1);
    expect(sent.map((m) => m.recipientId)).toContain(STUDENT);
    expect(sent.every((m) => m.type === 'cancel')).toBe(true);
  });
});
