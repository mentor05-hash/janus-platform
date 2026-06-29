/**
 * 관리자 권한레벨 (CLAUDE.md §iam RBAC). 역할은 admin 유지, 계층은 perm_level 로 구분.
 * L1 마스터(전역 최상위) > L2 본사관리자(전역) > L3 센터관리자(자기 센터).
 */
export type PermLevel = 'L1' | 'L2' | 'L3';

export const PERM_RANK: Record<PermLevel, number> = { L1: 3, L2: 2, L3: 1 };
export const PERM_TIER: Record<PermLevel, string> = {
  L1: '마스터',
  L2: '본사관리자',
  L3: '센터관리자',
};

/** have 가 need 이상 권한인지(숫자가 클수록 상위). */
export function permAtLeast(have: string | null | undefined, need: PermLevel): boolean {
  const h = have && have in PERM_RANK ? PERM_RANK[have as PermLevel] : 0;
  return h >= PERM_RANK[need];
}

export function permTier(level: string | null | undefined): string | null {
  return level && level in PERM_TIER ? PERM_TIER[level as PermLevel] : null;
}
