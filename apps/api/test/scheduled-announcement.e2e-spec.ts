import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AnnouncementService } from '../src/modules/notification/announcement.service';

/**
 * 예약 공지 + 발송 전날 사전알림 + 공지 템플릿(저장/재사용).
 */
const HQ = { id: '00000000-0000-4000-8000-0000000000a6', role: 'admin', centerId: null } as any;
const STU = '00000000-0000-4000-8000-0000000000a1';

describe('예약 공지·사전알림·템플릿(§3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let svc: AnnouncementService;

  const cleanNotis = () => prisma.notification.deleteMany({ where: { recipient_id: { in: [STU, HQ.id] }, type: { in: ['announcement', 'announcement_reminder'] } } });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    svc = mod.get(AnnouncementService);
    await prisma.scheduled_announcement.deleteMany({ where: { created_by: HQ.id } });
    await prisma.announcement_template.deleteMany({ where: { created_by: HQ.id } });
    await cleanNotis();
  });

  afterAll(async () => {
    await prisma.scheduled_announcement.deleteMany({ where: { created_by: HQ.id } });
    await prisma.announcement_template.deleteMany({ where: { created_by: HQ.id } });
    await cleanNotis();
    await app.close();
  });

  it('예약 등록 → 즉시 미발송(pending), 도래 후 runDue 로 발송', async () => {
    const future = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
    const r = await svc.send(HQ, { targets: ['student'], title: '예약공지', body: '본문', scheduledAt: future } as any);
    expect(r.status).toBe('pending');
    // 아직 학생에게 발송 안 됨
    expect(await prisma.notification.count({ where: { recipient_id: STU, type: 'announcement', payload: { path: ['title'], equals: '예약공지' } } })).toBe(0);

    // 도래시킨 뒤 runDue
    await prisma.scheduled_announcement.update({ where: { id: r.scheduledId }, data: { scheduled_at: new Date(Date.now() - 1000) } });
    const run = await svc.runDue(new Date());
    expect(run.processed).toBeGreaterThanOrEqual(1);
    const n = await prisma.notification.findFirst({ where: { recipient_id: STU, type: 'announcement', payload: { path: ['title'], equals: '예약공지' } } });
    expect(n).toBeTruthy();
    const row = await prisma.scheduled_announcement.findUnique({ where: { id: r.scheduledId } });
    expect(row?.status).toBe('sent');
  });

  it('발송 전날(24h 내) → 예약자(작성자)에게 사전알림 1회', async () => {
    const soon = new Date(Date.now() + 12 * 3600 * 1000).toISOString(); // 12시간 후
    const r = await svc.send(HQ, { targets: ['student'], title: '곧발송', body: 'x', scheduledAt: soon } as any);
    const rem = await svc.runReminders(new Date());
    expect(rem.reminded).toBeGreaterThanOrEqual(1);
    const noti = await prisma.notification.findFirst({ where: { recipient_id: HQ.id, type: 'announcement_reminder', payload: { path: ['scheduledId'], equals: r.scheduledId } } });
    expect(noti).toBeTruthy();
    // 재실행해도 중복 없음
    const before = await prisma.notification.count({ where: { recipient_id: HQ.id, type: 'announcement_reminder' } });
    await svc.runReminders(new Date());
    expect(await prisma.notification.count({ where: { recipient_id: HQ.id, type: 'announcement_reminder' } })).toBe(before);
  });

  it('예약 취소 → 발송 안 됨', async () => {
    const future = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
    const r = await svc.send(HQ, { targets: ['student'], title: '취소공지', body: 'x', scheduledAt: future } as any);
    await svc.cancelScheduled(r.scheduledId, HQ);
    await prisma.scheduled_announcement.update({ where: { id: r.scheduledId }, data: { scheduled_at: new Date(Date.now() - 1000) } });
    await svc.runDue(new Date());
    expect(await prisma.notification.count({ where: { recipient_id: STU, type: 'announcement', payload: { path: ['title'], equals: '취소공지' } } })).toBe(0);
  });

  it('템플릿 저장 → templateId 로 발송', async () => {
    const t = await svc.createTemplate(HQ, { name: '휴원안내', targets: ['student'], title: '템플릿제목', body: '템플릿본문' } as any);
    const list = await svc.listTemplates(HQ);
    expect(list.some((x) => x.id === t.id)).toBe(true);
    // templateId 만으로 발송(targets/title/body 생략)
    const r = await svc.send(HQ, { templateId: t.id } as any);
    expect((r as any).sent).toBeGreaterThanOrEqual(1);
    const n = await prisma.notification.findFirst({ where: { recipient_id: STU, type: 'announcement', payload: { path: ['title'], equals: '템플릿제목' } } });
    expect(n).toBeTruthy();
  });
});
