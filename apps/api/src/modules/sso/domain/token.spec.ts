import { issueSsoToken, verifySsoToken, type SsoClaims } from './token';
import { buildRegistry, tierMeets, isAllowedRedirect } from './registry';

const SECRET = 'test-sso-secret';
const claims: SsoClaims = {
  sub: '00000000-0000-0000-0000-000000000001',
  role: 'student',
  tier: 'member',
  aud: 'planner',
  scope: ['view'],
  epoch: 1,
};

describe('SSO token (issue/verify)', () => {
  it('발급→검증 왕복: payload 복원', () => {
    const t = issueSsoToken(SECRET, claims, 900, 1000);
    const p = verifySsoToken(SECRET, t, { now: 1000 });
    expect(p).not.toBeNull();
    expect(p!.sub).toBe(claims.sub);
    expect(p!.aud).toBe('planner');
    expect(p!.tier).toBe('member');
    expect(p!.iat).toBe(1000);
    expect(p!.exp).toBe(1900);
  });

  it('만료: exp 이후엔 null', () => {
    const t = issueSsoToken(SECRET, claims, 900, 1000);
    expect(verifySsoToken(SECRET, t, { now: 1901 })).toBeNull();
    expect(verifySsoToken(SECRET, t, { now: 1899 })).not.toBeNull();
  });

  it('위조: 다른 시크릿·변조 payload 는 거부', () => {
    const t = issueSsoToken(SECRET, claims, 900, 1000);
    expect(verifySsoToken('wrong-secret', t, { now: 1000 })).toBeNull();
    const [h, , sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, tier: 'paid', iat: 1000, exp: 1900 })).toString('base64url');
    expect(verifySsoToken(SECRET, `${h}.${forged}.${sig}`, { now: 1000 })).toBeNull();
  });

  it('형식 오류: 토막 수 불일치·빈 문자열은 null', () => {
    expect(verifySsoToken(SECRET, '', { now: 1000 })).toBeNull();
    expect(verifySsoToken(SECRET, 'a.b', { now: 1000 })).toBeNull();
    expect(verifySsoToken(SECRET, 'a.b.c.d', { now: 1000 })).toBeNull();
  });

  it('epoch 일괄 폐기: 서비스 epoch 증가 시 기존 토큰 무효', () => {
    const t = issueSsoToken(SECRET, { ...claims, epoch: 1 }, 900, 1000);
    expect(verifySsoToken(SECRET, t, { now: 1000, epoch: 1 })).not.toBeNull();
    expect(verifySsoToken(SECRET, t, { now: 1000, epoch: 2 })).toBeNull();
  });
});

describe('SSO registry (tier gate + redirect)', () => {
  const reg = buildRegistry('https://pages.janus.example');

  it('planner 는 파트너 모집 단계 → free 티어도 진입 가능', () => {
    expect(reg.planner.minTier).toBe('free');
    expect(tierMeets('free', reg.planner.minTier)).toBe(true);
  });

  it('배치표는 회원 게이트: free 거부, member 이상 허용', () => {
    expect(tierMeets('free', reg.baechipyo.minTier)).toBe(false);
    expect(tierMeets('member', reg.baechipyo.minTier)).toBe(true);
    expect(tierMeets('paid', reg.baechipyo.minTier)).toBe(true);
  });

  it('launchUrl origin 이 redirectOrigins 화이트리스트에 있어야 통과', () => {
    expect(isAllowedRedirect(reg.planner)).toBe(true);
    expect(isAllowedRedirect({ ...reg.planner, launchUrl: 'https://evil.example/steal' })).toBe(false);
  });
});
