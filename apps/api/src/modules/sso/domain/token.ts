import crypto from 'node:crypto';

/**
 * 크로스서비스 SSO 토큰 (HS256, 라이브러리 무의존) — 설계 근거:
 * `docs/SSO_토큰_일반화_설계_v1_2026-07-07.md`.
 * 정본 패턴(`apps/realtime-rooms/src/rooms/token.service.ts`, room epoch)을
 * 플랫폼 전역 SSO로 일반화한 순수 함수. NestJS 무의존 → 단위 테스트·이식 용이.
 */

export type SsoTier = 'free' | 'member' | 'paid' | 'consultant';

export type SsoToken = {
  sub: string; // accountId (UUID)
  role: string; // student|guardian|teacher|admin|hr
  tier: SsoTier; // 티어 게이트 판정 근거
  aud: string; // 대상 서비스 id (예: 'planner', 'baechipyo')
  scope: string[]; // 서비스 내 권한 (예: ['view','ingest-score'])
  epoch: number; // 서비스별 일괄 폐기 카운터 — 증가 시 기존 토큰 전부 무효
  iat: number; // 발급(초)
  exp: number; // 만료(초)
};

export type SsoClaims = Omit<SsoToken, 'iat' | 'exp'>;

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (secret: string, data: string) =>
  crypto.createHmac('sha256', secret).update(data).digest('base64url');

/** 발급: 클레임 + TTL(초) → HS256 토큰. `now`(초)는 테스트 주입용. */
export function issueSsoToken(secret: string, claims: SsoClaims, ttlSec: number, now = Math.floor(Date.now() / 1000)): string {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ ...claims, iat: now, exp: now + ttlSec } satisfies SsoToken);
  return `${h}.${p}.${sign(secret, `${h}.${p}`)}`;
}

/**
 * 검증: 서명·만료·(선택)epoch 확인 → payload | null.
 * 타이밍 안전 비교로 서명 대조. epoch 를 넘기면 서비스의 현재 epoch 와 일치할 때만 통과(일괄 폐기).
 */
export function verifySsoToken(secret: string, token: string, opts: { now?: number; epoch?: number } = {}): SsoToken | null {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const parts = (token || '').split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const expected = sign(secret, `${h}.${p}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString()) as SsoToken;
    if (!payload.sub || !payload.aud) return null;
    if (payload.exp && payload.exp < now) return null;
    if (opts.epoch != null && payload.epoch !== opts.epoch) return null;
    return payload;
  } catch {
    return null;
  }
}
