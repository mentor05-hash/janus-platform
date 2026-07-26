import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { NOTIFICATION_PROVIDER } from './notification.types';
import type { NotificationProvider, NotifyChannel } from './notification.types';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RealtimeService } from '../realtime/realtime.service';
import { renderNotification } from './notification-templates';

/**
 * 알림 발송 편의 래퍼 (§3 notification). 각 도메인 서비스가 이벤트 발생 시 호출.
 * recipientId 가 없으면(대상 미존재) 조용히 무시. 채널 기본 in-app('app').
 * 발송 자체는 NotificationProvider(outbox)가 채널별 전달·재시도 처리.
 */
@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);

  constructor(
    @Inject(NOTIFICATION_PROVIDER)
    private readonly provider: NotificationProvider,
    @Optional() private readonly realtime?: RealtimeGateway,
    @Optional() private readonly realtimeSvc?: RealtimeService,
  ) {}

  async notify(
    recipientId: string | null | undefined,
    type: string,
    payload: Record<string, unknown> = {},
    channels: NotifyChannel[] = ['app'],
  ): Promise<void> {
    if (!recipientId) return;
    try {
      await this.provider.send({ recipientId, type, channels, payload });
      // 인앱 알림은 접속 중인 수신자에게 실시간 push(정책 notif=off/all/premium 게이팅).
      if (channels.includes('app') && this.realtime && this.realtimeSvc) {
        void this.realtimeSvc
          .notifAllowed(recipientId)
          .then((ok) => {
            if (ok) {
              const { title, body } = renderNotification(type, payload);
              this.realtime!.emitToUser(recipientId, 'notif:new', {
                type,
                payload,
                title,
                body,
              });
            }
          })
          .catch(() => {});
      }
    } catch (e) {
      // 알림 실패가 본 트랜잭션/응답을 막지 않도록 격리(아웃박스가 재시도).
      this.logger.warn(
        `알림 발송 실패 type=${type} → ${recipientId}: ${(e as Error).message}`,
      );
    }
  }
}
