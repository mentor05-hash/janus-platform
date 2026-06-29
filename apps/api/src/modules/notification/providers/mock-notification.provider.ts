import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationProvider, NotifyMessage } from '../notification.types';

/**
 * 로컬 stub NotificationProvider. 발송은 로그로 대체하고 notification 테이블에 기록.
 * 실 채널(앱 푸시·SMS·카카오 알림톡)은 클라우드 구현으로 교체.
 */
@Injectable()
export class MockNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger('NotificationProvider:mock');

  constructor(private readonly prisma: PrismaService) {}

  async send(msg: NotifyMessage): Promise<void> {
    this.logger.log(
      `[stub] → ${msg.recipientId} (${msg.channels.join('/')}) type=${msg.type} ${JSON.stringify(msg.payload)}`,
    );
    await this.prisma.notification.create({
      data: {
        recipient_id: msg.recipientId,
        type: msg.type,
        channels: msg.channels,
        payload: msg.payload as object,
      },
    });
  }
}
