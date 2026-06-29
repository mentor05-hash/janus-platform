import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationOutboxService } from './notification-outbox.service';
import { OutboxNotificationProvider } from './providers/outbox-notification.provider';
import { StubChannelGateway } from './providers/stub-channel-gateway';
import { CHANNEL_GATEWAY, NOTIFICATION_PROVIDER } from './notification.types';
import type { ChannelGateway } from './notification.types';

/**
 * Notification 바운디드 컨텍스트 (CLAUDE.md §3·§10).
 * 채널 게이트웨이(ENV 로 실 채널 교체) + outbox 전달추적/재시도. 발송은 채널별 결과를
 * notification.delivery 에 기록하고 실패분은 NotificationOutboxService 가 재시도.
 */
@Module({
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationOutboxService,
    { provide: CHANNEL_GATEWAY, useClass: StubChannelGateway },
    {
      provide: NOTIFICATION_PROVIDER,
      inject: [PrismaService, CHANNEL_GATEWAY],
      useFactory: (prisma: PrismaService, gateway: ChannelGateway) =>
        new OutboxNotificationProvider(prisma, gateway),
    },
  ],
  exports: [NOTIFICATION_PROVIDER],
})
export class NotificationModule {}
