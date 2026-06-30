import { Injectable, Logger } from '@nestjs/common';
import {
  ChannelGateway,
  NotifyChannel,
  NotifyMessage,
} from '../notification.types';

/**
 * 로컬 stub 채널 게이트웨이(§10). 앱 인앱 알림은 성공으로 간주,
 * SMS·카카오 알림톡은 자격증명 미구성이라 실패(→ outbox 재시도 대상).
 * 실 채널(키 확보 시)은 각 채널 구현으로 교체.
 */
@Injectable()
export class StubChannelGateway implements ChannelGateway {
  private readonly logger = new Logger('ChannelGateway:stub');

  async deliver(channel: NotifyChannel, msg: NotifyMessage): Promise<boolean> {
    if (channel === 'app') {
      this.logger.log(`[stub] 인앱 알림 → ${msg.recipientId} type=${msg.type}`);
      return true;
    }
    // SMS·카카오 알림톡: 미구성 → 실패(재시도 대상)
    this.logger.warn(
      `[stub] ${channel} 미구성 — 발송 실패 처리 → ${msg.recipientId}`,
    );
    return false;
  }
}
