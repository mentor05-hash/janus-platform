import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { BookingService } from '../src/modules/booking/booking.service';
import { AdminPolicyService } from '../src/modules/pricing-policy/admin-policy.service';

/**
 * b1 §5-8 게이트: 기능 닫힘(FeatureAvailability)·방식 미허용(CategoryModePolicy) 시 예약 차단.
 */
const CENTER = '00000000-0000-4000-8000-0000000000c1';
const TEACHER = '00000000-0000-4000-8000-0000000000a2';
const STUDENT = '00000000-0000-4000-8000-0000000000a1';
const studentUser: any = { id: STUDENT, role: 'student', centerId: CENTER, loginId: 'student01' };
const hq: any = { id: '00000000-0000-4000-8000-0000000000a6', role: 'admin', centerId: null };
const DATE = '2034-03-03';

const book = (booking: BookingService, mode = 'zoom', consultType = '교과') =>
  booking.create(
    { teacherId: TEACHER, date: DATE, consultType: consultType as any, mode: mode as any, slotStart: 60, slotEnd: 63 } as any,
    studentUser,
  );

describe('b1 예약 게이트(§5-8)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let booking: BookingService;
  let policy: AdminPolicyService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    booking = mod.get(BookingService);
    policy = mod.get(AdminPolicyService);
    await prisma.feature_availability.deleteMany({ where: { target_type: 'mode', target_value: 'zoom' } });
    await prisma.category_mode_policy.deleteMany({ where: { center_id: CENTER, consult_type: 'subject' as any } });
  });

  afterAll(async () => {
    await prisma.feature_availability.deleteMany({ where: { target_type: 'mode', target_value: 'zoom' } });
    await prisma.category_mode_policy.deleteMany({ where: { center_id: CENTER, consult_type: 'subject' as any } });
    await app.close();
  });

  it('전사 zoom 닫힘 → zoom 예약 차단', async () => {
    await policy.setFeature({ scope: '전사', targetType: 'mode', targetValue: 'zoom', enabled: false }, hq);
    await expect(book(booking, 'zoom')).rejects.toThrow(/닫혀/);
    // 규칙 제거 → 기본 열림(다음 테스트가 카테고리 게이트에 도달)
    await prisma.feature_availability.deleteMany({ where: { target_type: 'mode', target_value: 'zoom' } });
  });

  it('카테고리×방식: 교과가 chat 만 허용 → 교과/zoom 차단', async () => {
    await prisma.category_mode_policy.create({
      data: { center_id: CENTER, consult_type: 'subject' as any, allowed_modes: ['chat'] as any },
    });
    await expect(book(booking, 'zoom', '교과')).rejects.toThrow(/사용할 수 없/);
  });
});
