import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AnnouncementService } from '../src/modules/notification/announcement.service';

/**
 * 관리자 공지 알림: 센터관리자는 자기 센터 대상 역할별 발송, 비대상 역할 제외.
 */
const C1 = '00000000-0000-4000-8000-0000000000c1';
const centerAdmin = { id: '00000000-0000-4000-8000-0000000000a3', role: 'admin', centerId: C1, loginId: 'admin01' } as any;
const STU = '00000000-0000-4000-8000-0000000000a1';
const TEA = '00000000-0000-4000-8000-0000000000a2';
const GUA = '00000000-0000-4000-8000-0000000000a5';

describe('관리자 공지 알림(§3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let svc: AnnouncementService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    svc = mod.get(AnnouncementService);
    await prisma.notification.deleteMany({ where: { type: 'announcement', recipient_id: { in: [STU, TEA, GUA] } } });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { type: 'announcement', recipient_id: { in: [STU, TEA, GUA] } } });
    await app.close();
  });

  it('센터관리자 → 학생·선생님 공지, 학부모는 비대상이라 제외', async () => {
    const r = await svc.send(centerAdmin, { targets: ['student', 'teacher'], title: '휴원 안내', body: '8/1 휴원합니다' } as any);
    expect(r.scope).toBe(C1);
    expect(r.byTarget.student).toBeGreaterThanOrEqual(1);
    expect(r.byTarget.teacher).toBeGreaterThanOrEqual(1);

    const stu = await prisma.notification.findFirst({ where: { recipient_id: STU, type: 'announcement' } });
    const tea = await prisma.notification.findFirst({ where: { recipient_id: TEA, type: 'announcement' } });
    const gua = await prisma.notification.findFirst({ where: { recipient_id: GUA, type: 'announcement' } });
    expect((stu!.payload as any).title).toBe('휴원 안내');
    expect(tea).toBeTruthy();
    expect(gua).toBeNull(); // 학부모는 대상 아님
  });

  it('학부모만 지정하면 학부모만 수신', async () => {
    await prisma.notification.deleteMany({ where: { type: 'announcement', recipient_id: { in: [STU, TEA, GUA] } } });
    const r = await svc.send(centerAdmin, { targets: ['guardian'], title: '상담주간', body: '이번주 상담주간' } as any);
    expect(r.byTarget.guardian).toBeGreaterThanOrEqual(1);
    const gua = await prisma.notification.findFirst({ where: { recipient_id: GUA, type: 'announcement' } });
    const stu = await prisma.notification.findFirst({ where: { recipient_id: STU, type: 'announcement' } });
    expect(gua).toBeTruthy();
    expect(stu).toBeNull();
  });
});
