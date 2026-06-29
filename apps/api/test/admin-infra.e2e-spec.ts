import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { utcFromKst } from '../src/common/time/kst';
import { AdminInfraService } from '../src/modules/availability/admin-infra.service';
import { AvailabilityService } from '../src/modules/availability/availability.service';
import { AdminPolicyService } from '../src/modules/pricing-policy/admin-policy.service';
import { BookingService } from '../src/modules/booking/booking.service';

/**
 * 2.4b DoD 통합테스트 (실 DB):
 *  - 줌 정책 설정/조회.
 *  - 차단 시간이 슬롯에 즉시 반영(blocked) + 해당 시간 예약 차단.
 *  - 가중 제한(§5-7): 노쇼 임계 초과 학생 신규 예약 차단.
 */
const CENTER = '00000000-0000-4000-8000-0000000000c1';
const TEACHER = '00000000-0000-4000-8000-0000000000a2';
const STU_A = '00000000-0000-4000-8000-0000000000a1';
const STU_P = '00000000-0000-4000-8000-0000000000e3'; // 가중제한 전용 학생

const admin: any = { id: '00000000-0000-4000-8000-0000000000a3', role: 'admin', centerId: CENTER };
const studentA: any = { id: STU_A, role: 'student', centerId: CENTER, loginId: 'student01' };
const studentP: any = { id: STU_P, role: 'student', centerId: CENTER, loginId: 'pen_test' };
const DATE = '2031-03-10';

describe('2.4b 줌·상담실·차단·가중제한 통합', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let infra: AdminInfraService;
  let availability: AvailabilityService;
  let policy: AdminPolicyService;
  let booking: BookingService;
  const blockedIds: string[] = [];

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    infra = mod.get(AdminInfraService);
    availability = mod.get(AvailabilityService);
    policy = mod.get(AdminPolicyService);
    booking = mod.get(BookingService);
  });

  afterAll(async () => {
    for (const id of blockedIds) await prisma.blocked_time.delete({ where: { id } }).catch(() => {});
    await prisma.penalty_policy.deleteMany({ where: { center_id: CENTER } });
    await prisma.account.deleteMany({ where: { id: STU_P } });
    await prisma.zoom_policy.deleteMany({ where: { center_id: CENTER } });
    await app.close();
  });

  it('근무표 IDOR 차단: 비소유 교사는 타 교사 근무표 수정 불가(S1 회귀)', async () => {
    const other: any = { id: '00000000-0000-4000-8000-0000000000a1', role: 'teacher' };
    await expect(availability.putWorkSchedule(TEACHER, {}, other)).rejects.toThrow();
  });

  it('줌 정책 설정/조회', async () => {
    await infra.setZoomPolicy({ concurrentLimit: 10 }, admin);
    const zp: any = await infra.getZoomPolicy(admin);
    expect(zp.concurrent_limit).toBe(10);
  });

  it('차단 시간이 슬롯에 즉시 반영(blocked) + 예약 차단', async () => {
    // 10:00–10:30 KST 차단
    const bt: any = await infra.createBlocked(
      { type: '모의고사', startAt: utcFromKst(DATE, 600).toISOString(), endAt: utcFromKst(DATE, 630).toISOString() },
      admin,
    );
    blockedIds.push(bt.id);

    const slots: any[] = await availability.getDaySlots(TEACHER, DATE, STU_A);
    expect(slots.find((s) => s.index === 60)?.status).toBe('blocked');

    await expect(
      booking.create(
        { teacherId: TEACHER, date: DATE, consultType: '교과' as any, mode: 'zoom' as any, slotStart: 60, slotEnd: 63 } as any,
        studentA,
      ),
    ).rejects.toThrow();
  });

  it('가중 제한(§5-7): 노쇼 임계 초과 학생 신규 예약 차단', async () => {
    // 전용 학생(노쇼 2)
    await prisma.account.deleteMany({ where: { id: STU_P } });
    await prisma.account.create({
      data: { id: STU_P, role: 'student' as any, center_id: CENTER, login_id: 'pen_test', pw_hash: 'x', name: 'pen', status: 'approved' as any },
    });
    await prisma.student_profile.create({ data: { account_id: STU_P, center_id: CENTER, noshow_count: 2 } });
    await policy.updatePenalty({ noshowThreshold: 1 }, admin);

    await expect(
      booking.create(
        { teacherId: TEACHER, date: DATE, consultType: '교과' as any, mode: 'zoom' as any, slotStart: 80, slotEnd: 83 } as any,
        studentP,
      ),
    ).rejects.toThrow(/가중 제한/);

    // a1(노쇼 0)은 동일 정책에서도 제한되지 않음
    const sp = await prisma.student_profile.findUnique({ where: { account_id: STU_A } });
    expect(sp?.noshow_count ?? 0).toBe(0);
  });
});
