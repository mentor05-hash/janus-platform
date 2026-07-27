// 학원찾기 출처(provenance) 라벨 — 스펙 §3. 모든 노출 필드는 3등급 라벨과 1:1.
// public(공공 신고자료) / claimed(학원 제공·미검증) / verified(야누스 집계).

export const ACADEMY_SOURCE_LABEL: Record<string, string> = {
  public: '공공 신고자료',
  claimed: '학원 제공 · 야누스 미검증',
};

export const TUITION_SOURCE_LABEL: Record<string, string> = {
  declared: '신고가', // 공공 신고 수강료
  claimed: '학원 제공',
};

export const COHORT_SOURCE_LABEL: Record<string, string> = {
  claimed: '학원 제공 · 야누스 미검증',
  verified: '야누스 검증 ✓',
};

export function academySourceLabel(source?: string | null): string {
  return ACADEMY_SOURCE_LABEL[source ?? 'public'] ?? '공공 신고자료';
}

export function tuitionSourceLabel(source?: string | null): string {
  return TUITION_SOURCE_LABEL[source ?? 'declared'] ?? '신고가';
}

/** verified 는 재원생 n명 기준을 함께 노출(§3). */
export function cohortSourceLabel(
  source?: string | null,
  nTotal?: number,
): string {
  const base =
    COHORT_SOURCE_LABEL[source ?? 'claimed'] ?? '학원 제공 · 야누스 미검증';
  if (source === 'verified' && nTotal && nTotal > 0)
    return `${base} (재원생 ${nTotal}명 기준)`;
  return base;
}
