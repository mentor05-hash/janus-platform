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
const admin: any = {
  id: '00000000-0000-4000-8000-0000000000a3',
  role: 'admin',
  centerId: CENTER,
  loginId: 'admin01',
};
const hq: any = {
  id: '00000000-0000-4000-8000-0000000000a6',
  role: 'admin',
  centerId: null,
}; // 본사(전사 토글)

describe('2.4a 관리자 정책(요금·한도·기능토글) 통합', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let policy: AdminPolicyService;
  let pricing: PricingService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    policy = mod.get(AdminPolicyService);
    pricing = mod.get(PricingService);
    await prisma.feature_availability.deleteMany({
      where: { target_type: 'mode', target_value: 'zoom' },
    });
  });

  afterAll(async () => {
    await policy.updatePricing({ mode: 'hand', perHour: 36_000 }, admin); // 원복
    await policy.updateLimits({ classifyFitLimit: 10 }, admin); // 원복
    await prisma.feature_availability.deleteMany({
      where: { target_type: 'mode', target_value: 'zoom' },
    });
    await app.close();
  });

  it('요금 변경이 quote 에 즉시 반영(센터 override)', async () => {
    await policy.updatePricing({ mode: 'hand', perHour: 40_000 }, admin);
    // 센터 스코프: 해당 센터 컨텍스트로 견적해야 override 반영
    const q = await pricing.quoteSession('hand', 30, 'A', CENTER);
    expect(q.credits).toBe(20_000); // round(40000×30/60)
    // 다른 센터(없음)/전사 fallback 은 기본 단가 유지
    const base = await pricing.quoteSession('hand', 30, 'A', null);
    expect(base.credits).toBe(18_000); // 전사 기본 36000 → 18000
  });

  it('기능 토글: 전사 우선 — 전사 닫힘이 센터 열림을 덮음', async () => {
    await policy.setFeature(
      { scope: '센터', targetType: 'mode', targetValue: 'zoom', enabled: true },
      admin,
    );
    let r = await policy.resolveFeature(CENTER, 'mode', 'zoom');
    expect(r.enabled).toBe(true);
    await policy.setFeature(
      {
        scope: '전사',
        targetType: 'mode',
        targetValue: 'zoom',
        enabled: false,
      },
      hq,
    ); // 전사 토글은 HQ
    r = await policy.resolveFeature(CENTER, 'mode', 'zoom');
    expect(r.enabled).toBe(false); // 전사 우선
  });

  it('한도 정책 변경 영속(§5-9 신규 차단 근거)', async () => {
    await policy.updateLimits({ classifyFitLimit: 5 }, admin);
    const lp: any = await policy.getLimits(admin);
    expect(lp.classify_fit_limit).toBe(5);
  });
});
