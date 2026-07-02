import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PgWebhookService } from './pg-webhook.service';

/** 서명검증(HMAC) 순수 로직 — DB 불필요. §9 O2. */
describe('PgWebhookService.verifySignature', () => {
  const raw = '{"eventId":"e1","type":"payment.paid"}';
  const make = (secret?: string) =>
    new PgWebhookService(
      {} as never,
      {} as never,
      { get: (k: string) => (k === 'PG_WEBHOOK_SECRET' ? secret : undefined) } as unknown as ConfigService,
    );

  it('시크릿 미설정(데모)이면 서명 없이도 통과', () => {
    expect(make(undefined).verifySignature(raw, undefined)).toBe(true);
  });

  it('시크릿 설정 시 올바른 HMAC 서명은 통과', () => {
    const secret = 'whsec_test';
    const sig = createHmac('sha256', secret).update(raw).digest('hex');
    expect(make(secret).verifySignature(raw, sig)).toBe(true);
  });

  it('시크릿 설정 시 서명 누락·위조는 거부', () => {
    const svc = make('whsec_test');
    expect(svc.verifySignature(raw, undefined)).toBe(false);
    expect(svc.verifySignature(raw, 'deadbeef')).toBe(false);
  });
});
