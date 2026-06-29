import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { MockNotificationProvider } from './providers/mock-notification.provider';
import { NOTIFICATION_PROVIDER } from './notification.types';

/**
 * Notification 바운디드 컨텍스트 (CLAUDE.md §3).
 * NotificationProvider 어댑터 제공(ENV NOTIFICATION_PROVIDER 로 구현 선택, 현재 mock 만).
 */
@Module({
  controllers: [NotificationController],
  providers: [
    NotificationService,
    MockNotificationProvider,
    {
      provide: NOTIFICATION_PROVIDER,
      inject: [ConfigService, PrismaService],
      useFactory: (config: ConfigService, prisma: PrismaService) => {
        const which = config.get<string>('NOTIFICATION_PROVIDER') ?? 'mock';
        switch (which) {
          // case 'kakao': return new KakaoNotificationProvider(...); // 클라우드 후결합
          default:
            return new MockNotificationProvider(prisma);
        }
      },
    },
  ],
  exports: [NOTIFICATION_PROVIDER],
})
export class NotificationModule {}
