/**
 * 기능 열기/닫기 해석 (CLAUDE.md §5-8).
 * 전사 강제 + 센터 자율, 충돌 시 전사 우선.
 */
export interface FeatureRule {
  scope: string; // '전사' | '센터' | '캠프' | '외부생'
  centerId: string | null;
  targetType: string; // category / mode / board / online / offline
  targetValue: string; // 담임 / zoom / ...
  enabled: boolean;
}

export interface FeatureQuery {
  centerId: string | null;
  targetType: string;
  targetValue: string;
}

export function resolveFeatureEnabled(
  rules: FeatureRule[],
  q: FeatureQuery,
  defaultEnabled = true,
): boolean {
  const matching = rules.filter(
    (r) => r.targetType === q.targetType && r.targetValue === q.targetValue,
  );
  // 전사(force) 우선
  const company = matching.find((r) => r.scope === '전사');
  if (company) return company.enabled;
  // 센터 자율
  const center = matching.find((r) => r.scope === '센터' && r.centerId === q.centerId);
  if (center) return center.enabled;
  return defaultEnabled;
}
