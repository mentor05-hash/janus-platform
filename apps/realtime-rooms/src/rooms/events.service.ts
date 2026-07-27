import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 호스트 백엔드로의 아웃바운드 이벤트(웹훅) — 룸 서비스는 도메인을 모르므로
 * "무슨 일이 있었다"만 통지하고 해석(알림 발송 등)은 호스트가 한다.
 * ENV: EVENTS_WEBHOOK_URL(미설정 시 무동작) · 키는 ROOMS_API_KEY 재사용(EVENTS_WEBHOOK_KEY 로 오버라이드).
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger('RoomsEvents');
  // 수신자별 통지 스로틀(60초) — 연타 메시지의 웹훅 폭주 방지(원장 스로틀은 호스트 몫).
  private readonly throttle = new Map<string, number>();
  constructor(private readonly config: ConfigService) {}

  private get url() { return this.config.get<string>('EVENTS_WEBHOOK_URL') || ''; }
  private get key() { return this.config.get<string>('EVENTS_WEBHOOK_KEY') || this.config.get<string>('ROOMS_API_KEY') || ''; }

  /** 부재중 채팅 통지 — 방에 없는 참가자에게 새 메시지가 왔음을 호스트에 전달. 실패 비차단. */
  chatMissed(e: { roomId: string; externalRef: string | null; recipientExtUserId: string; senderName?: string; preview: string }) {
    if (!this.url || !e.externalRef) return;
    const tk = `${e.roomId}:${e.recipientExtUserId}`;
    const now = Date.now();
    if ((this.throttle.get(tk) ?? 0) > now - 60_000) return;
    this.throttle.set(tk, now);
    if (this.throttle.size > 5000) this.throttle.clear(); // 무한 성장 방지(드묾)
    void fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.key },
      body: JSON.stringify({ type: 'chat.missed', ...e }),
    }).catch((err) => this.logger.warn(`chat.missed 웹훅 실패: ${err?.message ?? err}`));
  }
}
