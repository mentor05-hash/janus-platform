import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type {
  ChannelGateway,
  DeliveryMap,
  NotificationProvider,
  NotifyMessage,
} from '../notification.types';

/**
 * Outbox NotificationProvider (§10) — notification 행에 채널별 전달 상태를 기록.
 * 각 채널을 ChannelGateway 로 발송 시도하고 결과(sent/failed)를 delivery 에 저장.
 * 실패 채널은 NotificationOutboxService 가 재시도(키 확보 후 실제 전달 보장).
 */
@Injectable()
export class OutboxNotificationProvider implements NotificationProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ChannelGateway,
  ) {}

  async send(msg: NotifyMessage): Promise<void> {
    const delivery: DeliveryMap = {};
    for (const ch of msg.channels) {
      const ok = await this.gateway.deliver(ch, msg);
      delivery[ch] = ok ? 'sent' : 'failed';
    }
    await this.prisma.notification.create({
      data: {
        recipient_id: msg.recipientId,
        type: msg.type,
        channels: msg.channels,
        payload: msg.payload as Prisma.InputJsonValue,
        delivery: delivery,
        attempts: 1,
        last_attempt_at: new Date(),
      },
    });
  }
}
