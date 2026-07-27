import { signSsoToken, tierAtLeast, verifySsoToken } from './sso-token';

const SECRET = 'test-secret';
const base = {
  sub: 'u1',
  role: 'student' as const,
  tier: 'member' as const,
  aud: 'baechipyo',
  scope: ['view'],
  epoch: 1,
};

describe('SSO 토큰 (O42 — HS256+epoch)', () => {
  it('발급→검증 왕복', () => {
    const t = signSsoToken(base, 900, SECRET, 1000);
    const r = verifySsoToken(t, SECRET, 1, 'baechipyo', 1001);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.sub).toBe('u1');
      expect(r.payload.tier).toBe('member');
      expect(r.payload.exp).toBe(1900);
    }
  });

  it('위조(서명 불일치) 거부', () => {
    const t = signSsoToken(base, 900, SECRET, 1000);
    const forged = t.slice(0, -3) + 'xxx';
    expect(verifySsoToken(forged, SECRET, 1, undefined, 1001)).toMatchObject({
      ok: false,
      reason: 'bad_signature',
    });
    expect(verifySsoToken(t, 'other-secret', 1, undefined, 1001)).toMatchObject(
      { ok: false, reason: 'bad_signature' },
    );
  });

  it('만료 거부', () => {
    const t = signSsoToken(base, 10, SECRET, 1000);
    expect(verifySsoToken(t, SECRET, 1, undefined, 1011)).toMatchObject({
      ok: false,
      reason: 'expired',
    });
  });

  it('epoch 증가 = 일괄 폐기', () => {
    const t = signSsoToken(base, 900, SECRET, 1000);
    expect(verifySsoToken(t, SECRET, 2, undefined, 1001)).toMatchObject({
      ok: false,
      reason: 'epoch_revoked',
    });
  });

  it('aud 불일치 거부', () => {
    const t = signSsoToken(base, 900, SECRET, 1000);
    expect(verifySsoToken(t, SECRET, 1, 'ipgyeol', 1001)).toMatchObject({
      ok: false,
      reason: 'aud_mismatch',
    });
  });

  it('형식 불량 거부', () => {
    expect(verifySsoToken('a.b', SECRET)).toMatchObject({
      ok: false,
      reason: 'malformed',
    });
    expect(verifySsoToken('', SECRET)).toMatchObject({
      ok: false,
      reason: 'malformed',
    });
  });
});

describe('tierAtLeast (min_tier 게이트)', () => {
  it('free<member<paid<consultant 서열', () => {
    expect(tierAtLeast('member', 'free')).toBe(true);
    expect(tierAtLeast('member', 'member')).toBe(true);
    expect(tierAtLeast('member', 'paid')).toBe(false);
    expect(tierAtLeast('consultant', 'paid')).toBe(true);
  });
});
