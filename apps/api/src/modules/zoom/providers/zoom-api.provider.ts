import { Logger } from '@nestjs/common';
import { IssueJoinInput, JoinInfo, ZoomProvider } from '../zoom.types';

type Creds = { accountId?: string; clientId?: string; clientSecret?: string };

/**
 * 실 Zoom API ZoomProvider — Server-to-Server OAuth(account_credentials)로 토큰 발급 후
 * 미팅 생성 API 로 입장 URL 발급 (§9·§10). ENV ZOOM_CLIENT_ID/SECRET/ACCOUNT_ID 로 활성.
 * 자격증명 미구성 시 명시적 실패(호출 시점) — 부팅은 막지 않음.
 */
export class ZoomApiProvider implements ZoomProvider {
  private readonly logger = new Logger('ZoomProvider:zoom');
  private token: { value: string; exp: number } | null = null;

  constructor(private readonly creds: Creds) {
    if (!creds.accountId || !creds.clientId || !creds.clientSecret) {
      this.logger.warn('Zoom S2S 자격증명 미구성 — 호출 시 실패합니다(ZOOM_PROVIDER=mock 권장).');
    }
  }

  /** S2S OAuth 토큰(계정 자격증명) — 만료 60초 전까지 캐시. */
  private async accessToken(): Promise<string> {
    const { accountId, clientId, clientSecret } = this.creds;
    if (!accountId || !clientId || !clientSecret) {
      throw new Error('Zoom 자격증명(ZOOM_ACCOUNT_ID·CLIENT_ID·CLIENT_SECRET)이 필요합니다.');
    }
    const now = Date.now();
    if (this.token && this.token.exp - 60_000 > now) return this.token.value;
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`,
      { method: 'POST', headers: { Authorization: `Basic ${basic}` } },
    );
    if (!res.ok) throw new Error(`Zoom 토큰 발급 실패(${res.status})`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, exp: now + j.expires_in * 1000 };
    return j.access_token;
  }

  async issueJoinUrl(input: IssueJoinInput): Promise<JoinInfo> {
    const token = await this.accessToken();
    const durationMin =
      input.startAt && input.endAt
        ? Math.max(15, Math.round((input.endAt.getTime() - input.startAt.getTime()) / 60_000))
        : 40;
    const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: input.topic ?? `상담 ${input.bookingId}`,
        type: 2, // 예약 미팅
        start_time: input.startAt?.toISOString(),
        duration: durationMin,
        settings: { join_before_host: true, waiting_room: false, approval_type: 2 },
      }),
    });
    if (!res.ok) throw new Error(`Zoom 미팅 생성 실패(${res.status})`);
    const m = (await res.json()) as { id: number | string; join_url: string };
    this.logger.log(`미팅 생성 booking=${input.bookingId} → ${m.id}`);
    return { joinUrl: m.join_url, meetingId: String(m.id) };
  }
}
