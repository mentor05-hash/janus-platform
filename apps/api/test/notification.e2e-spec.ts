import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { NotificationService } from '../src/modules/notification/notification.service';

/**
 * 알림 수신함 (목록·읽음·소유권). 발송은 NotificationProvider, 조회는 NotificationService.
 */
const STUDENT = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a3';

describe('알림 수신함', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let svc: NotificationService;
  let id: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    svc = mod.get(NotificationService);
    const n = await prisma.notification.create({
      data: { recipient_id: STUDENT, type: 'cancel', channels: ['app'], payload: { test: true } },
    });
    id = n.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { id } });
    await app.close();
  });

  it('본인 알림 목록 조회', async () => {
    const list = await svc.list(STUDENT);
    expect(list.some((n) => n.id === id)).toBe(true);
  });

  it('읽음 처리 → read_at 설정', async () => {
    await svc.markRead(id, STUDENT);
    const n = await prisma.notification.findUnique({ where: { id } });
    expect(n!.read_at).not.toBeNull();
  });

  it('타인 알림 읽음 처리 불가(IDOR 방지)', async () => {
    await expect(svc.markRead(id, OTHER)).rejects.toThrow();
  });
});
