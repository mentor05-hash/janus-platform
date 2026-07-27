/**
 * N33 축 A(신뢰) — 답변자 자격 배지(순수). provenance 3등급 어휘를 재사용.
 * claimed(자기신고·미검증) / verified(검증). verified 승격은 후속(IdentityVerify 연동).
 */
export type VerifyTier = 'claimed' | 'verified';

export const CREDENTIAL_BADGE: Record<VerifyTier, string> = {
  claimed: '자기신고',
  verified: '검증 ✓',
};

export function credentialBadge(tier?: string | null): string {
  return CREDENTIAL_BADGE[tier as VerifyTier] ?? CREDENTIAL_BADGE.claimed;
}
