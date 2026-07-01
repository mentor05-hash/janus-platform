import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import { withCronLock } from '../../common/cache/cron-lock';
import {
  CHANNEL_GATEWAY,
  DeliveryMap,
  DeliveryStatus,
  NotifyChannel,
  NotifyMessage,
} from './notification.types';
import type { ChannelGateway } from './notification.types';

const MAX_ATTEMPTS = 5;

/**
 * 알림 outbox 재시도 (§10) — 일부 채널 발송 실패한 알림을 주기적으로 재발송.
 * 실패 채널만 재시도하고 attempts 한도(MAX_ATTEMPTS) 초과는 중단. 키 확보 후 실제 전달 보장.
 */
@Injectable()
export class NotificationOutboxService {
  private readonly logger = new Logger(NotificationOutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_GATEWAY) private readonly gateway: ChannelGateway,
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
  ) {}

  @Cron(process.env.NOTIFICATION_RETRY_CRON ?? '*/5 * * * *')
  async scheduledRetry() {
    await withCronLock(this.cache, 'notification-retry', 240, async () => {
      const n = await this.retryFailed();
      if (n.retried)
        this.logger.log(`알림 재시도: ${n.recovered}/${n.retried} 복구`);
    }, this.logger);
  }

  /** 실패 채널이 남은 알림을 재발송. 반환: {retried 알림 수, recovered 완전복구 수}. */
  async retryFailed(
    limit = 200,
  ): Promise<{ retried: number; recovered: number }> {
    const rows = await this.prisma.notification.findMany({
      where: { attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { created_at: 'asc' },
      take: limit,
    });
    let retried = 0;
    let recovered = 0;
    for (const row of rows) {
      const delivery = (row.delivery as DeliveryMap) ?? {};
      const failed = (Object.keys(delivery) as NotifyChannel[]).filter(
        (c) => delivery[c] === 'failed',
      );
      if (failed.length === 0) continue;

      const msg: NotifyMessage = {
        recipientId: row.recipient_id,
        type: row.type ?? '',
        channels: failed,
        payload: (row.payload as Record<string, unknown>) ?? {},
      };
      const next: DeliveryMap = { ...delivery };
      for (const ch of failed) {
        const ok = await this.gateway.deliver(ch, msg);
        next[ch] = ok ? 'sent' : 'failed';
      }
      const stillFailed = Object.values(next).some((s) => s === 'failed');
      await this.prisma.notification.update({
        where: { id: row.id },
        data: {
          delivery: next,
          attempts: { increment: 1 },
          last_attempt_at: new Date(),
        },
      });
      retried++;
      if (!stillFailed) recovered++;
    }
    return { retried, recovered };
  }
}
