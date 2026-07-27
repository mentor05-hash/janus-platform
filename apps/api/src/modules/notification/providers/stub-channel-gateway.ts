import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { renderNotification } from '../notification-templates';
import {
  ChannelGateway,
  NotifyChannel,
  NotifyMessage,
} from '../notification.types';

/**
 * 로컬 stub 채널 게이트웨이(§10). 앱 인앱 알림·푸시(mock)는 성공으로 간주,
 * SMS·카카오 알림톡은 자격증명 미구성이라 실패(→ outbox 재시도 대상).
 * 실 채널(키 확보 시)은 각 채널 구현으로 교체.
 */
@Injectable()
export class StubChannelGateway implements ChannelGateway {
  private readonly logger = new Logger('ChannelGateway:stub');

  constructor(private readonly prisma: PrismaService) {}

  async deliver(channel: NotifyChannel, msg: NotifyMessage): Promise<boolean> {
    if (channel === 'app') {
      this.logger.log(`[stub] 인앱 알림 → ${msg.recipientId} type=${msg.type}`);
      return true;
    }
    if (channel === 'push') {
      // mock 푸시: 등록된 기기 토큰으로 발송하는 척(실 연동은 Expo Push API 로 교체)
      const tokens = await this.prisma.push_token.findMany({
        where: { account_id: msg.recipientId },
        select: { token: true },
      });
      this.logger.log(
        `[stub] 푸시 발송(mock) → ${msg.recipientId} type=${msg.type} 기기=${tokens.length}`,
      );
      return true; // mock: 항상 성공(토큰 없으면 no-op)
    }
    // SMS·카카오 알림톡: 미구성 → 실패(재시도 대상). 실 채널 교체 시 이 렌더 문구를 발송.
    const { title, body } = renderNotification(msg.type, msg.payload);
    this.logger.warn(
      `[stub] ${channel} 미구성 — 발송 실패 처리 → ${msg.recipientId} · "${title}: ${body}"`,
    );
    return false;
  }
}
