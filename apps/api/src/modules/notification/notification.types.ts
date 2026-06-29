/**
 * NotificationProvider 어댑터 인터페이스 (CLAUDE.md §10).
 * 로컬은 mock stub, 클라우드는 앱·SMS·카카오 알림톡 구현으로 교체(코드 변경 없이 ENV 전환).
 */
export const NOTIFICATION_PROVIDER = Symbol('NOTIFICATION_PROVIDER');

export type NotifyChannel = 'app' | 'sms' | 'kakao';

export interface NotifyMessage {
  recipientId: string; // account id
  type: string; // cancel / payment_request / reminder ...
  channels: NotifyChannel[];
  payload: Record<string, unknown>;
}

export interface NotificationProvider {
  send(msg: NotifyMessage): Promise<void>;
}
