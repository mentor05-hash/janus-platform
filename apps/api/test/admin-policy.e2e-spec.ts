import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AdminPolicyService } from '../src/modules/pricing-policy/admin-policy.service';
import { PricingService } from '../src/modules/pricing-policy/pricing.service';

/**
 * 2.4a DoD 통합테스트 (실 DB):
 *  - 요금 정책 변경이 quote 에 즉시 반영.
 *  - 기능 토글: 전사 우선(전사 닫힘이 센터 열림을 덮음).
 *  - 한도 정책 변경 영속.
 */
const CENTER = '00000000-0000-4000-8000-0000000000c1';
const admin: any = { id: '00000000-0000-4000-8000-0000000000a3', role: 'admin', centerId: CENTER, loginId: 'admin01' };

describe('2.4a 관리자 정책(요금·한도·기능토글) 통합', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let policy: AdminPolicyService;
  let pricing: PricingService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    policy = mod.get(AdminPolicyService);
    pricing = mod.get(PricingService);
    await prisma.feature_availability.deleteMany({ where: { target_type: 'mode', target_value: 'zoom' } });
  });

  afterAll(async () => {
    await policy.updatePricing({ mode: 'hand' as any, perHour: 36_000 }, admin); // 원복
    await policy.updateLimits({ classifyFitLimit: 10 }, admin); // 원복
    await prisma.feature_availability.deleteMany({ where: { target_type: 'mode', target_value: 'zoom' } });
    await app.close();
  });

  it('요금 변경이 quote 에 즉시 반영', async () => {
    await policy.updatePricing({ mode: 'hand' as any, perHour: 40_000 }, admin);
    const q = await pricing.quoteSession('hand' as any, 30, 'A' as any);
    expect(q.credits).toBe(20_000); // round(40000×30/60)
  });

  it('기능 토글: 전사 우선 — 전사 닫힘이 센터 열림을 덮음', async () => {
    await policy.setFeature({ scope: '센터', targetType: 'mode', targetValue: 'zoom', enabled: true }, admin);
    let r = await policy.resolveFeature(CENTER, 'mode', 'zoom');
    expect(r.enabled).toBe(true);
    await policy.setFeature({ scope: '전사', targetType: 'mode', targetValue: 'zoom', enabled: false }, admin);
    r = await policy.resolveFeature(CENTER, 'mode', 'zoom');
    expect(r.enabled).toBe(false); // 전사 우선
  });

  it('한도 정책 변경 영속(§5-9 신규 차단 근거)', async () => {
    await policy.updateLimits({ classifyFitLimit: 5 }, admin);
    const lp: any = await policy.getLimits(admin);
    expect(lp.classify_fit_limit).toBe(5);
  });
});
