import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AvailabilityService } from '../src/modules/availability/availability.service';
import { BookingService } from '../src/modules/booking/booking.service';

/**
 * 결함 회귀 2건(대규모 시뮬에서 발견):
 *  ① resolveStay — 체류시간 템플릿은 있으나 해당 요일 창이 없으면 그 날은 예약 불가
 *    (이전엔 종일 가용으로 오인 → 평일전용 학생이 주말에도 잡힘).
 *  ② 오프라인 상담실 배정 — offline 예약 시 room_id 배정, 방 없으면 차단.
 */
const C1 = '00000000-0000-4000-8000-0000000000c1';
const TEA = '00000000-0000-4000-8000-0000000009a1';
const STU = '00000000-0000-4000-8000-0000000009a2';
const MON = '2026-07-20'; // 월요일(weekday '1')
const TUE = '2026-07-21'; // 화요일(weekday '2')

describe('근무·체류·상담실(시뮬 회귀)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let availability: AvailabilityService;
  let booking: BookingService;
  let roomId = '';

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    availability = mod.get(AvailabilityService);
    booking = mod.get(BookingService);
    const pw = (await prisma.account.findUnique({ where: { login_id: 'student01' } }))!.pw_hash;

    await prisma.account.create({ data: { id: TEA, role: 'teacher' as any, center_id: C1, login_id: 'sr_tea', pw_hash: pw, name: '회귀쌤', status: 'approved' as any } });
    await prisma.teacher_profile.create({ data: { account_id: TEA, center_id: C1, subjects: ['수학'], grade: 'A' as any } });
    await prisma.work_schedule.create({ data: { teacher_id: TEA, recurring_template: Object.fromEntries(['0','1','2','3','4','5','6'].map((d) => [d, [{ start: '09:00', end: '18:00' }]])) as object } });

    await prisma.account.create({ data: { id: STU, role: 'student' as any, center_id: C1, login_id: 'sr_stu', pw_hash: pw, name: '회귀학생', status: 'approved' as any } });
    // 체류: 월요일('1')만
    await prisma.student_profile.create({ data: { account_id: STU, center_id: C1, stay_time: { '1': [{ start: '09:00', end: '18:00' }] } as object } });
    await prisma.credit_account.create({ data: { student_id: STU, purchased_balance: 500000, granted_balance: 0, reserved_credits: 0 } });
    const room = await prisma.room.create({ data: { center_id: C1, type: 'offline', capacity: 1, status: 'available' } });
    roomId = room.id;
  });

  afterAll(async () => {
    const acct = await prisma.credit_account.findUnique({ where: { student_id: STU } });
    await prisma.time_slot.deleteMany({ where: { teacher_id: TEA } });
    if (acct) await prisma.credit_transaction.deleteMany({ where: { account_id: acct.id } });
    await prisma.booking.deleteMany({ where: { teacher_id: TEA } });
    await prisma.room.deleteMany({ where: { center_id: C1 } });
    await prisma.credit_account.deleteMany({ where: { student_id: STU } });
    await prisma.student_profile.deleteMany({ where: { account_id: STU } });
    await prisma.work_schedule.deleteMany({ where: { teacher_id: TEA } });
    await prisma.teacher_profile.deleteMany({ where: { account_id: TEA } });
    await prisma.account.deleteMany({ where: { id: { in: [TEA, STU] } } });
    await app.close();
  });

  it('① 체류 있는 요일(월)은 가용, 체류 없는 요일(화)은 0 가용', async () => {
    const mon = await availability.getDaySlots(TEA, MON, STU);
    const tue = await availability.getDaySlots(TEA, TUE, STU);
    expect(mon.filter((s) => s.status === 'avail').length).toBeGreaterThan(0);
    expect(tue.filter((s) => s.status === 'avail').length).toBe(0); // 수정 전이면 종일 가용(버그)
  });

  const studentUser = () => ({ id: STU, role: 'student', centerId: C1, loginId: 'sr_stu' }) as any;

  it('② 오프라인 예약 → 상담실(room_id) 배정', async () => {
    const b: any = await booking.create({ teacherId: TEA, date: MON, consultType: '교과', mode: 'offline', slotStart: 60, slotEnd: 63 } as any, studentUser());
    expect(b.roomId).toBe(roomId);
  });

  it('② 상담실이 없으면 오프라인 예약 차단(409)', async () => {
    // 앞 예약이 room 을 FK 참조하므로 먼저 비운 뒤 방 제거
    await prisma.time_slot.deleteMany({ where: { teacher_id: TEA } });
    await prisma.booking.deleteMany({ where: { teacher_id: TEA } });
    await prisma.room.deleteMany({ where: { center_id: C1 } });
    await expect(
      booking.create({ teacherId: TEA, date: MON, consultType: '교과', mode: 'offline', slotStart: 66, slotEnd: 69 } as any, studentUser()),
    ).rejects.toThrow(/상담실/);
  });
});
