/**
 * 담임 공백(homeroom gap) 판정 — 순수 함수(데이터 접근 없음, 단위테스트 대상).
 * 마지막 담임 상담 이후 경과일을 센터 정책 임계(warn/danger)와 대조해 레벨을 매긴다.
 * (CLAUDE.md §consultation·T6 뷰어 필터용)
 */

export type HomeroomGapLevel = 'none' | 'ok' | 'warn' | 'danger';

export type HomeroomPolicy = {
  cycleDays: number | null;
  warnDays: number | null;
  dangerDays: number | null;
};

export type HomeroomGap = {
  lastHomeroomAt: string | null;
  daysSince: number | null;
  level: HomeroomGapLevel;
  cycleDays: number | null;
  warnDays: number | null;
  dangerDays: number | null;
};

const DAY_MS = 86_400_000;

/**
 * 임계 해석: danger = dangerDays, warn = warnDays(없으면 cycleDays 로 대체).
 * 마지막 담임 상담이 없으면 level='none'(경과일 미상). 임계 미설정이면 'ok'.
 */
export function homeroomGap(
  lastHomeroomAt: Date | null,
  policy: HomeroomPolicy,
  now: Date,
): HomeroomGap {
  const base = {
    cycleDays: policy.cycleDays,
    warnDays: policy.warnDays,
    dangerDays: policy.dangerDays,
  };
  if (!lastHomeroomAt) {
    return { lastHomeroomAt: null, daysSince: null, level: 'none', ...base };
  }
  const daysSince = Math.floor((now.getTime() - lastHomeroomAt.getTime()) / DAY_MS);
  const warnAt = policy.warnDays ?? policy.cycleDays; // warn 미설정 시 주기로 대체
  const dangerAt = policy.dangerDays;
  let level: HomeroomGapLevel = 'ok';
  if (dangerAt != null && daysSince >= dangerAt) level = 'danger';
  else if (warnAt != null && daysSince >= warnAt) level = 'warn';
  return {
    lastHomeroomAt: lastHomeroomAt.toISOString(),
    daysSince,
    level,
    ...base,
  };
}
