import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { BookingService } from '../src/modules/booking/booking.service';
import { CreditService } from '../src/modules/billing/credit.service';

/**
 * fix-2 동시성 회귀 (실 DB):
 *  - H1: 인접 예약 동시 생성 시 advisory lock + 버퍼 재검증으로 정확히 1건만 성공(§5-1 TOCTOU).
 *  - H2: 동일 예약 동시 취소 시 조건부 전이로 1회만 적용·환원(이중 환원 방지).
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
const teacherUser: any = {
  id: TEACHER,
  role: 'teacher',
  centerId: CENTER,
  loginId: 'teacher01',
};
const DATE = '2032-02-02';

const settled = (rs: PromiseSettledResult<unknown>[]) => ({
  ok: rs.filter((r) => r.status === 'fulfilled').length,
  fail: rs.filter((r) => r.status === 'rejected').length,
});

describe('fix-2 동시성', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let booking: BookingService;
  let credit: CreditService;

  async function purge() {
    const bs = await prisma.booking.findMany({
      where: {
        teacher_id: TEACHER,
        start_at: { gte: new Date(`${DATE}T00:00:00Z`) },
      },
      select: { id: true },
    });
    const ids = bs.map((b) => b.id);
    if (ids.length) {
      await prisma.time_slot.deleteMany({ where: { booking_id: { in: ids } } });
      await prisma.booking.deleteMany({ where: { id: { in: ids } } });
    }
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
    await purge();
    await credit.charge(STUDENT, 200_000);
  });

  afterAll(async () => {
    await purge();
    await app.close();
  });

  it('H1: 인접 슬롯 동시 예약 → 정확히 1건만 성공(버퍼 보존)', async () => {
    // A=slots 60,61(10:00–10:20) / B=slots 62,63 — B는 A의 뒤 버퍼(slot 62) 침범
    const mk = (s: number, e: number) =>
      booking.create(
        {
          teacherId: TEACHER,
          date: DATE,
          consultType: '교과',
          mode: 'zoom',
          slotStart: s,
          slotEnd: e,
        },
        studentUser,
      );
    const rs = await Promise.allSettled([mk(60, 62), mk(62, 64)]);
    const { ok, fail } = settled(rs);
    expect(ok).toBe(1);
    expect(fail).toBe(1);
  });

  it('H2: 동일 예약 동시 취소 → 1회만 적용·환원', async () => {
    const b: any = await booking.create(
      {
        teacherId: TEACHER,
        date: DATE,
        consultType: '교과',
        mode: 'zoom',
        slotStart: 80,
        slotEnd: 83,
      },
      studentUser,
    );
    await booking.accept(b.id, teacherUser); // confirmed
    const before = await credit.getAccount(STUDENT);

    const rs = await Promise.allSettled([
      booking.cancel(b.id, studentUser),
      booking.cancel(b.id, studentUser),
    ]);
    const { ok, fail } = settled(rs);
    expect(ok).toBe(1);
    expect(fail).toBe(1);

    const after = await credit.getAccount(STUDENT);
    expect(after.total).toBe(before.total + 20_000); // 단 1회 환원
  });

  it('M2: NOSHOW 전이가 학생 noshow_count 를 증가시킨다(§5-7 카운터)', async () => {
    const STU_N = '00000000-0000-4000-8000-0000000000e7';
    await prisma.account.deleteMany({ where: { id: STU_N } });
    await prisma.account.create({
      data: {
        id: STU_N,
        role: 'student' as any,
        center_id: CENTER,
        login_id: 'noshow_t',
        pw_hash: 'x',
        name: 'n',
        status: 'approved' as any,
      },
    });
    await prisma.student_profile.create({
      data: { account_id: STU_N, center_id: CENTER, noshow_count: 0 },
    });
    const b = await prisma.booking.create({
      data: {
        student_id: STU_N,
        teacher_id: TEACHER,
        center_id: CENTER,
        consult_type: 'subject' as any,
        mode: 'zoom' as any,
        status: 'confirmed' as any,
      },
    });
    try {
      await booking.noshow(b.id, teacherUser);
      const sp = await prisma.student_profile.findUnique({
        where: { account_id: STU_N },
      });
      expect(sp!.noshow_count).toBe(1);
    } finally {
      await prisma.time_slot.deleteMany({ where: { booking_id: b.id } });
      await prisma.booking.delete({ where: { id: b.id } }).catch(() => {});
      await prisma.account.deleteMany({ where: { id: STU_N } });
    }
  });
});
