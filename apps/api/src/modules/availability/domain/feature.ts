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
  studentType?: 'enrolled' | 'external'; // 지정 시 '외부생' scope 규칙 해석
}

export function resolveFeatureEnabled(
  rules: FeatureRule[],
  q: FeatureQuery,
  defaultEnabled = true,
): boolean {
  const matching = rules.filter(
    (r) => r.targetType === q.targetType && r.targetValue === q.targetValue,
  );
  // 전사(force) 최우선
  const company = matching.find((r) => r.scope === '전사');
  if (company) return company.enabled;
  // 외부생 유형 강제(외부학생 대상 전사 규칙) — 센터 자율보다 우선
  if (q.studentType === 'external') {
    const external = matching.find((r) => r.scope === '외부생');
    if (external) return external.enabled;
  }
  // 센터 자율
  const center = matching.find(
    (r) => r.scope === '센터' && r.centerId === q.centerId,
  );
  if (center) return center.enabled;
  return defaultEnabled;
}
