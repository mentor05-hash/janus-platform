/**
 * SSO 토큰(순수) — O42: rooms TokenService(HS256 수제 JWT + epoch) 패턴의 플랫폼 전역 승격.
 * 외부 의존 0. 시크릿은 SSO_JWT_SECRET(rooms 와 분리 — 네임스페이스 독립).
 * 추후 정적 게이트·rooms 공용화 시 packages/sso 로 추출(설계 §5) — 시그니처 유지.
 */
import * as crypto from 'node:crypto';

export type SsoTier = 'free' | 'member' | 'paid' | 'consultant';
export type SsoRole = 'student' | 'guardian' | 'teacher' | 'admin' | 'hr';

export interface SsoTokenPayload {
  sub: string; // accountId
  role: SsoRole;
  tier: SsoTier;
  aud: string; // 서비스 id (sso_service.id — 예: 'baechipyo')
  scope: string[];
  epoch: number; // 서비스별 일괄 폐기 카운터
  iat: number;
  exp: number;
}

const TIER_RANK: Record<SsoTier, number> = {
  free: 0,
  member: 1,
  paid: 2,
  consultant: 3,
};

export const tierAtLeast = (tier: SsoTier, min: SsoTier): boolean =>
  TIER_RANK[tier] >= TIER_RANK[min];

/**
 * 역할 → 서비스 티어(O53 잠정 규칙, 단일 소스). admin/hr = consultant · 그 외 로그인 = member.
 * paid 승격은 가격 확정(N23~N25) 후 membership 연동 시 여기서 분기 추가.
 */
export function tierForRole(role: string): SsoTier {
  return role === 'admin' || role === 'hr' ? 'consultant' : 'member';
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const hmac = (data: string, secret: string) =>
  crypto.createHmac('sha256', secret).update(data).digest('base64url');

export function signSsoToken(
  payload: Omit<SsoTokenPayload, 'iat' | 'exp'>,
  ttlSec: number,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): string {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({
    ...payload,
    iat: nowSec,
    exp: nowSec + ttlSec,
  } satisfies SsoTokenPayload);
  return `${h}.${p}.${hmac(`${h}.${p}`, secret)}`;
}

export type SsoVerifyResult =
  | { ok: true; payload: SsoTokenPayload }
  | {
      ok: false;
      reason:
        | 'malformed'
        | 'bad_signature'
        | 'expired'
        | 'epoch_revoked'
        | 'aud_mismatch';
    };

/** currentEpoch: sso_service.epoch 현재값 — 불일치 = 일괄 폐기됨. expectedAud 지정 시 aud 일치 강제. */
export function verifySsoToken(
  token: string,
  secret: string,
  currentEpoch?: number,
  expectedAud?: string,
  nowSec = Math.floor(Date.now() / 1000),
): SsoVerifyResult {
  const parts = (token || '').split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [h, p, sig] = parts;
  const expect = hmac(`${h}.${p}`, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    return { ok: false, reason: 'bad_signature' };
  let payload: SsoTokenPayload;
  try {
    payload = JSON.parse(
      Buffer.from(p, 'base64url').toString(),
    ) as SsoTokenPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!payload.sub || !payload.aud || typeof payload.epoch !== 'number')
    return { ok: false, reason: 'malformed' };
  if (payload.exp && payload.exp < nowSec)
    return { ok: false, reason: 'expired' };
  if (expectedAud && payload.aud !== expectedAud)
    return { ok: false, reason: 'aud_mismatch' };
  if (currentEpoch != null && payload.epoch !== currentEpoch)
    return { ok: false, reason: 'epoch_revoked' };
  return { ok: true, payload };
}
