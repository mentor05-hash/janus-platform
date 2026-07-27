/**
 * 약점 클리닉 추이 요약(순수) — 점수 배열(오래된→최근)에서 회차·평균·최고·향상도 계산.
 * improvement = 최근 − 최초(반복 훈련 효과). 표본 없으면 null.
 */
export type ClinicSummaryStats = {
  count: number;
  avgScore: number | null;
  bestScore: number | null;
  improvement: number | null;
};

export function summarizeClinic(scores: number[]): ClinicSummaryStats {
  const n = scores.length;
  if (n === 0)
    return { count: 0, avgScore: null, bestScore: null, improvement: null };
  const sum = scores.reduce((a, b) => a + b, 0);
  return {
    count: n,
    avgScore: Math.round(sum / n),
    bestScore: Math.max(...scores),
    improvement: scores[n - 1] - scores[0],
  };
}
