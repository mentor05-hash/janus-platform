/**
 * 대시보드 평가/분석 순수 함수 (CLAUDE.md §evaluation·ops). 데이터 접근 없음 — 단위테스트 대상.
 */

export const WEIGHT_KEYS = [
  'w_total',
  'w_completion',
  'w_rerequest',
  'w_reject',
  'w_noshow',
  'w_response',
  'w_satisfaction',
] as const;
export type WeightKey = (typeof WEIGHT_KEYS)[number];
export type Weights = Record<WeightKey, number>;

/** 역지표(낮을수록 좋음): 정규화 시 반전. */
export const REVERSE_METRICS = new Set(['reject', 'noshow', 'response']);

/** 가중치 합계 검증 — 정확히 100 이어야 함. */
export function weightsSumTo100(w: Weights): boolean {
  return WEIGHT_KEYS.reduce((s, k) => s + (w[k] ?? 0), 0) === 100;
}

/**
 * 표본 내 min-max 정규화 → 0~100. reverse=true 면 반전(작을수록 100).
 * 표본이 모두 같으면(분산 0) 중립 50.
 */
export function minMaxNormalize(values: number[], reverse = false): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 50);
  return values.map((v) => {
    const n = ((v - min) / (max - min)) * 100;
    return Math.round((reverse ? 100 - n : n) * 10) / 10;
  });
}

/**
 * z-score 표준화 후 0~100 매핑(50 + 15·z, [0,100] 클램프). reverse 면 부호 반전.
 * 분산 0 이면 전부 50.
 */
export function zScoreTo0100(values: number[], reverse = false): number[] {
  const n = values.length;
  if (n === 0) return [];
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  if (std === 0) return values.map(() => 50);
  return values.map((v) => {
    const z = (v - mean) / std;
    const mapped = 50 + 15 * (reverse ? -z : z);
    return Math.round(Math.min(100, Math.max(0, mapped)) * 10) / 10;
  });
}

/**
 * 지표별 정규화 점수(0~100)와 가중치로 종합점수(0~100) 산출.
 * normByMetric 키 예: total, completion, rerequest, reject, noshow, response, satisfaction.
 */
export function weightedScore(
  normByMetric: Record<string, number>,
  weights: Weights,
): number {
  let acc = 0;
  let wsum = 0;
  for (const key of WEIGHT_KEYS) {
    const metric = key.slice(2); // w_total -> total
    const w = weights[key] ?? 0;
    const norm = normByMetric[metric] ?? 50;
    acc += (w / 100) * norm;
    wsum += w;
  }
  // 가중치 합이 100 이 아니어도 비례 보정(방어적)
  return wsum === 0 ? 0 : Math.round((acc * (100 / wsum)) * 10) / 10;
}

/** 비율(%) 안전 계산. */
export function pct(numer: number, denom: number): number {
  return denom === 0 ? 0 : Math.round((numer / denom) * 1000) / 10;
}

/** 기간 → 시작/끝 경계. 미지정/all 이면 undefined(전체). */
export function resolvePeriod(
  period: string | undefined,
  from: string | undefined,
  to: string | undefined,
  now: Date,
): { gte?: Date; lte?: Date } | undefined {
  switch (period) {
    case '1w':
      return { gte: new Date(now.getTime() - 7 * 86_400_000) };
    case '2w':
      return { gte: new Date(now.getTime() - 14 * 86_400_000) };
    case '1m':
      return { gte: new Date(now.getTime() - 30 * 86_400_000) };
    case 'date':
    case 'custom':
      if (from || to) {
        return {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lte: new Date(to) } : {}),
        };
      }
      return undefined;
    default:
      return undefined; // all
  }
}
