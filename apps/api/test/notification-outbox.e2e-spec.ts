import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { NotificationOutboxService } from '../src/modules/notification/notification-outbox.service';
import { NOTIFICATION_PROVIDER } from '../src/modules/notification/notification.types';
import type { NotificationProvider } from '../src/modules/notification/notification.types';

/**
 * a4 §10 알림 전달추적/재시도: 채널별 delivery 기록 + outbox 재시도(복구·잔존 실패).
 */
const STUDENT = '00000000-0000-4000-8000-0000000000a1';

describe('a4 알림 outbox(§10)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let provider: NotificationProvider;
  let outbox: NotificationOutboxService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
    prisma = mod.get(PrismaService);
    provider = mod.get(NOTIFICATION_PROVIDER);
    outbox = mod.get(NotificationOutboxService);
    // 공유 DB 알림 백로그가 retryFailed 배치(take 200)를 막지 않도록 선정리 — 시드엔 알림 없음.
    await prisma.notification.deleteMany({});
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { recipient_id: STUDENT, type: { startsWith: 'a4_' } },
    });
    await app.close();
  });

  it('발송 시 채널별 전달 상태 기록(app=sent, kakao=failed)', async () => {
    await provider.send({
      recipientId: STUDENT,
      type: 'a4_send',
      channels: ['app', 'kakao'],
      payload: { x: 1 },
    });
    const row = await prisma.notification.findFirst({
      where: { recipient_id: STUDENT, type: 'a4_send' },
      orderBy: { created_at: 'desc' },
    });
    const delivery = row!.delivery as Record<string, string>;
    expect(delivery.app).toBe('sent');
    expect(delivery.kakao).toBe('failed');
    expect(row!.attempts).toBe(1);
  });

  it('재시도 → 복구 가능 채널(app) 전달 완료', async () => {
    const n = await prisma.notification.create({
      data: {
        recipient_id: STUDENT,
        type: 'a4_recover',
        channels: ['app'],
        payload: {},
        delivery: { app: 'failed' },
        attempts: 1,
      },
    });
    const r = await outbox.retryFailed();
    expect(r.recovered).toBeGreaterThanOrEqual(1);
    const after = await prisma.notification.findUnique({ where: { id: n.id } });
    expect((after!.delivery as Record<string, string>).app).toBe('sent');
    expect(after!.attempts).toBe(2);
  });

  it('재시도해도 미구성 채널(kakao)은 실패 잔존 + 시도횟수 증가', async () => {
    const n = await prisma.notification.create({
      data: {
        recipient_id: STUDENT,
        type: 'a4_stuck',
        channels: ['kakao'],
        payload: {},
        delivery: { kakao: 'failed' },
        attempts: 1,
      },
    });
    await outbox.retryFailed();
    const after = await prisma.notification.findUnique({ where: { id: n.id } });
    expect((after!.delivery as Record<string, string>).kakao).toBe('failed');
    expect(after!.attempts).toBe(2);
  });
});
