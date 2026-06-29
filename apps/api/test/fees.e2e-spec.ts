import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PricingService } from '../src/modules/pricing-policy/pricing.service';
import { AdminPolicyService } from '../src/modules/pricing-policy/admin-policy.service';
import { ConsultMode, ConsultType, TeacherGrade } from '../src/config/enums';

/**
 * b2 §5-2 요금 실반영: 오프라인 점유료(O5)·입시 유료컨설팅(O33) 가산.
 * 전사 기본정책(center_id NULL)을 HQ 로 갱신 후 견적이 반영되는지 검증.
 */
const hq: any = { id: '00000000-0000-4000-8000-0000000000a6', role: 'admin', centerId: null };

describe('b2 요금 가산(§5-2)', () => {
  let app: INestApplication;
  let pricing: PricingService;
  let policy: AdminPolicyService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    pricing = mod.get(PricingService);
    policy = mod.get(AdminPolicyService);
    await policy.updatePricing({ mode: 'offline', offlineOccupancyFee: 0 } as any, hq);
    await policy.updatePricing({ mode: 'zoom', paidConsultingFee: 0 } as any, hq);
  });

  afterAll(async () => {
    await policy.updatePricing({ mode: 'offline', offlineOccupancyFee: 0 } as any, hq);
    await policy.updatePricing({ mode: 'zoom', paidConsultingFee: 0 } as any, hq);
    await app.close();
  });

  it('오프라인 점유료가 견적에 가산된다', async () => {
    const base = await pricing.quoteSession(ConsultMode.OFFLINE, 30, TeacherGrade.B, null);
    await policy.updatePricing({ mode: 'offline', offlineOccupancyFee: 5000 } as any, hq);
    const withFee = await pricing.quoteSession(ConsultMode.OFFLINE, 30, TeacherGrade.B, null);
    expect(withFee.occupancyFee).toBe(5000);
    expect(withFee.credits - base.credits).toBe(5000);
  });

  it('입시 유료컨설팅 단가가 입시 상담에만 가산된다', async () => {
    await policy.updatePricing({ mode: 'zoom', paidConsultingFee: 30000 } as any, hq);
    const normal = await pricing.quoteSession(ConsultMode.ZOOM, 30, TeacherGrade.B, null);
    const admission = await pricing.quoteSession(
      ConsultMode.ZOOM,
      30,
      TeacherGrade.B,
      null,
      ConsultType.ADMISSION,
    );
    expect(normal.paidConsultingFee).toBe(0);
    expect(admission.paidConsultingFee).toBe(30000);
    expect(admission.credits - normal.credits).toBe(30000);
  });
});
