/**
 * Q3 리그 판정(순수) — 커뮤니티 답변 실적(채택수·채택률·답변수)으로 등급 산정.
 * tier: 3(입문·기본) → 2(정예) → 1(마스터). 낮을수록 상위.
 * 임계값은 서비스가 system_setting['qna_league_policy']로 주입(N27 확정 전 아래 기본값).
 */
export interface LeagueStats {
  authored: number; // 답변 수(숨김 제외)
  accepted: number; // 채택 수
  acceptRate: number; // 채택률(%) — 0~100
}

/** 한 등급 승급 요건: 최소 답변·최소 채택·최소 채택률 모두 충족 시 진입. */
export interface TierRule {
  minAuthored: number;
  minAccepted: number;
  minRate: number;
}
export interface LeaguePolicy {
  promote2: TierRule; // 2부 진입 요건
  promote1: TierRule; // 1부 진입 요건
}

/** N27(리그 수치) 확정 전 잠정 기본값 — system_setting으로 override. */
export const DEFAULT_LEAGUE_POLICY: LeaguePolicy = {
  promote2: { minAuthored: 5, minAccepted: 3, minRate: 50 },
  promote1: { minAuthored: 15, minAccepted: 10, minRate: 70 },
};

export const TIER_LABEL: Record<number, string> = {
  3: '3부 · 입문',
  2: '2부 · 정예',
  1: '1부 · 마스터',
};

const meets = (s: LeagueStats, r: TierRule): boolean =>
  s.authored >= r.minAuthored &&
  s.accepted >= r.minAccepted &&
  s.acceptRate >= r.minRate;

/** 실적 → 최고 달성 등급(3 기본, 요건 충족 시 2 또는 1). */
export function evaluateLeague(
  s: LeagueStats,
  policy: LeaguePolicy = DEFAULT_LEAGUE_POLICY,
): number {
  if (meets(s, policy.promote1)) return 1;
  if (meets(s, policy.promote2)) return 2;
  return 3;
}

/** 다음 상위 등급과 그 요건(1부면 null) — 진행도 안내용. */
export function nextTierNeed(
  currentTier: number,
  policy: LeaguePolicy = DEFAULT_LEAGUE_POLICY,
): { tier: number; rule: TierRule } | null {
  if (currentTier <= 1) return null;
  if (currentTier === 2) return { tier: 1, rule: policy.promote1 };
  return { tier: 2, rule: policy.promote2 };
}
