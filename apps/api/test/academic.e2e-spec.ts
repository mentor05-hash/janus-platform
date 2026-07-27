import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AcademicService } from '../src/modules/academic/academic.service';

/**
 * 학사일정(academic): 본사=전국(center null)·센터관리자=자기 센터 강제, 학생 조회=전국+본인 센터,
 * 타 스코프 수정 불가.
 */
const C1 = '00000000-0000-4000-8000-0000000000c1';
const hq: any = { id: '00000000-0000-4000-8000-0000000000a6', role: 'admin', centerId: null };
const centerAdmin: any = { id: '00000000-0000-4000-8000-0000000000a3', role: 'admin', centerId: C1 };
const student: any = { id: '00000000-0000-4000-8000-0000000000a1', role: 'student', centerId: C1 };
const TAG = '[E2E-ACA]';

describe('학사일정(academic)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let svc: AcademicService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    svc = mod.get(AcademicService);
    await prisma.academic_event.deleteMany({ where: { title: { startsWith: TAG } } });
  });

  afterAll(async () => {
    await prisma.academic_event.deleteMany({ where: { title: { startsWith: TAG } } });
    await app.close();
  });

  it('본사(HQ) 생성 → 전국 공통(center_id null)', async () => {
    const ev = await svc.create(hq, { title: `${TAG} 수능`, type: 'suneung', startDate: '2026-11-19', grade: '고3' });
    expect(ev.center_id).toBeNull();
    expect(ev.type).toBe('suneung');
  });

  it('센터관리자 생성 → 자기 센터로 강제(dto.centerId 무시)', async () => {
    const ev = await svc.create(centerAdmin, {
      title: `${TAG} 센터특강`,
      type: 'exam',
      startDate: '2026-08-25',
      centerId: 'ffffffff-0000-4000-8000-000000000000', // 무시되어야 함
    });
    expect(ev.center_id).toBe(C1);
  });

  it('기간 일정(신청기간)은 end_date 저장', async () => {
    const ev = await svc.create(hq, { title: `${TAG} 신청기간`, type: 'mock_apply', startDate: '2026-08-10', endDate: '2026-08-21' });
    expect(ev.end_date).not.toBeNull();
  });

  it('학생 조회 → 전국 + 본인 센터 모두 포함', async () => {
    const titles = (await svc.listForViewer(student)).map((e) => e.title);
    expect(titles).toContain(`${TAG} 수능`); // 전국
    expect(titles).toContain(`${TAG} 센터특강`); // 본인 센터
  });

  it('센터관리자는 전국(본사) 일정 수정 불가', async () => {
    const national = (await svc.listAdmin(hq)).find((e) => e.title === `${TAG} 수능`)!;
    await expect(svc.update(centerAdmin, national.id, { title: `${TAG} 변경시도` })).rejects.toThrow();
  });

  it('본사는 전국 일정 수정 가능', async () => {
    const national = (await svc.listAdmin(hq)).find((e) => e.title === `${TAG} 수능`)!;
    const upd = await svc.update(hq, national.id, { grade: '재수' });
    expect(upd.grade).toBe('재수');
  });
});
