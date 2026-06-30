import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AdminPolicyService } from '../src/modules/pricing-policy/admin-policy.service';
import { PricingService } from '../src/modules/pricing-policy/pricing.service';
import { PayrollService } from '../src/modules/payroll/payroll.service';

/**
 * HQ(본사 슈퍼관리자 = admin + center_id NULL) 역할 분리.
 *  - 전사 요금/기능토글 편집은 HQ만, 센터 관리자는 자기 센터만.
 *  - HQ 는 교차센터 권한(예: 타 센터 교사 급여 조회).
 */
const CENTER = '00000000-0000-4000-8000-0000000000c1';
const OTHER = '00000000-0000-4000-8000-0000000000c9';
const TEACHER = '00000000-0000-4000-8000-0000000000a2';

const hq: any = {
  id: '00000000-0000-4000-8000-0000000000a6',
  role: 'admin',
  centerId: null,
};
const centerAdmin: any = {
  id: '00000000-0000-4000-8000-0000000000a3',
  role: 'admin',
  centerId: CENTER,
};

describe('HQ 본사 관리자', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let policy: AdminPolicyService;
  let pricing: PricingService;
  let payroll: PayrollService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    policy = mod.get(AdminPolicyService);
    pricing = mod.get(PricingService);
    payroll = mod.get(PayrollService);
  });

  afterAll(async () => {
    await policy.updatePricing({ mode: 'chat', perHour: 18_000 }, hq); // 전사 원복
    await prisma.pricing_policy.deleteMany({
      where: { center_id: CENTER, mode: 'chat' as never },
    }); // 센터 override 정리
    await prisma.feature_availability.deleteMany({
      where: { target_type: 'mode', target_value: 'board' },
    });
    await app.close();
  });

  it('HQ 는 전사 요금을 편집(전역 fallback에 반영)', async () => {
    await policy.updatePricing({ mode: 'chat', perHour: 40_000 }, hq);
    expect(
      (await pricing.quoteSession('chat' as any, 30, 'A' as any, null)).credits,
    ).toBe(20_000);
    // 센터 override 없는 타 센터도 전사 fallback
    expect(
      (await pricing.quoteSession('chat' as any, 30, 'A' as any, OTHER))
        .credits,
    ).toBe(20_000);
  });

  it('센터 관리자는 전사를 덮어쓰지 못함(자기 센터 행만)', async () => {
    await policy.updatePricing({ mode: 'chat', perHour: 99_000 }, centerAdmin);
    const base = await prisma.pricing_policy.findFirst({
      where: { center_id: null, mode: 'chat' as never },
    });
    expect(base!.per_hour).toBe(40_000); // 전사는 HQ가 둔 값 유지(센터 관리자 영향 없음)
    const centerRow = await prisma.pricing_policy.findFirst({
      where: { center_id: CENTER, mode: 'chat' as never },
    });
    expect(centerRow!.per_hour).toBe(99_000); // 센터 override 만 변경
  });

  it('전사 기능 토글은 HQ만, 센터 관리자는 거부', async () => {
    await expect(
      policy.setFeature(
        {
          scope: '전사',
          targetType: 'mode',
          targetValue: 'board',
          enabled: false,
        },
        centerAdmin,
      ),
    ).rejects.toThrow();
    const r = await policy.setFeature(
      {
        scope: '전사',
        targetType: 'mode',
        targetValue: 'board',
        enabled: false,
      },
      hq,
    );
    expect(r).toBeTruthy();
  });

  it('HQ 는 교차센터 권한 — 타 센터 교사 급여 조회 가능', async () => {
    const est: any = await payroll.estimate(TEACHER, hq); // TEACHER 는 c1, HQ 는 센터 미소속 → 허용
    expect(est.teacherId).toBe(TEACHER);
  });
});
