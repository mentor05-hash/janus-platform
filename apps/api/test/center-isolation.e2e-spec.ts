import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { ConsultationService } from '../src/modules/consultation/consultation.service';

/**
 * 결함 회귀(SC-02): 센터관리자/HR 은 자기 센터 학생만 열람.
 * (이전엔 admin/HR 이 센터 무관 전 학생 상담기록 열람 가능 = 격리 위반 §7/S4)
 */
const STU_C1 = '00000000-0000-4000-8000-0000000000a1'; // student01 = 강남(C1)
const C1 = '00000000-0000-4000-8000-0000000000c1';
const OTHER_CENTER = '00000000-0000-4000-8000-0000000000c2';

describe('센터 격리 — 상담기록 열람(§7/S4)', () => {
  let app: INestApplication;
  let svc: ConsultationService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    svc = mod.get(ConsultationService);
  });
  afterAll(async () => app.close());

  const admin = (centerId: string | null) => ({ id: 'x', role: 'admin', centerId, loginId: 'a' }) as any;

  it('타 센터 관리자 → 403 거부', async () => {
    await expect(svc.listForStudent(STU_C1, admin(OTHER_CENTER))).rejects.toThrow(/다른 센터/);
  });

  it('자기 센터 관리자 → 허용', async () => {
    await expect(svc.listForStudent(STU_C1, admin(C1))).resolves.toBeDefined();
  });

  it('본사/마스터(센터 미소속) → 전체 허용', async () => {
    await expect(svc.listForStudent(STU_C1, admin(null))).resolves.toBeDefined();
  });
});
