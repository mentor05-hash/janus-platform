/**
 * NotificationProvider 어댑터 인터페이스 (CLAUDE.md §10).
 * 로컬은 mock stub, 클라우드는 앱·SMS·카카오 알림톡 구현으로 교체(코드 변경 없이 ENV 전환).
 */
export const NOTIFICATION_PROVIDER = Symbol('NOTIFICATION_PROVIDER');

export type NotifyChannel = 'app' | 'sms' | 'kakao' | 'push';

export interface NotifyMessage {
  recipientId: string; // account id
  type: string; // cancel / payment_request / reminder ...
  channels: NotifyChannel[];
  payload: Record<string, unknown>;
}

export interface NotificationProvider {
  send(msg: NotifyMessage): Promise<void>;
}

/**
 * 채널 게이트웨이 — 채널별 실제 발송 seam(§10). 로컬은 stub(앱=성공, SMS·알림톡=미구성 실패),
 * 클라우드는 실 채널 구현으로 교체. 발송 성공 여부를 반환해 outbox 재시도에 사용.
 */
export const CHANNEL_GATEWAY = Symbol('CHANNEL_GATEWAY');

export type DeliveryStatus = 'sent' | 'failed';
export type DeliveryMap = Partial<Record<NotifyChannel, DeliveryStatus>>;

export interface ChannelGateway {
  deliver(channel: NotifyChannel, msg: NotifyMessage): Promise<boolean>;
}
