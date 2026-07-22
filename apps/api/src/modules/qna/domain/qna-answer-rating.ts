/**
 * N33 축 B(능력·설명방식 오각형) — 답변 수령자 재평가 집계(순수).
 * 축(axis) 5종: 정확·친절·논리·속도·눈높이. 점수 1~5.
 * 집계 시 표본 미달(축별 n<minSample) 축은 avg=null 로 흐린다(노출 게이트 — 거짓 레이더 차단).
 */
export const RATING_AXES = ['accuracy', 'kindness', 'logic', 'speed', 'level'] as const;
export type RatingAxis = (typeof RATING_AXES)[number];

export const AXIS_LABEL: Record<RatingAxis, string> = {
  accuracy: '정확',
  kindness: '친절',
  logic: '논리',
  speed: '속도',
  level: '눈높이',
};

export const RATING_MIN = 1;
export const RATING_MAX = 5;
/** 설명방식 오각형 노출 표본 게이트(축별) — N33 [DEC] ㉙ 기본값. */
export const AXIS_MIN_SAMPLE = 5;

export const isValidAxis = (a: string): a is RatingAxis => (RATING_AXES as readonly string[]).includes(a);
export const isValidScore = (n: number): boolean => Number.isInteger(n) && n >= RATING_MIN && n <= RATING_MAX;

export interface AxisStat {
  axis: RatingAxis;
  label: string;
  count: number;
  avg: number | null; // 표본 미달이면 null(게이트)
}

/** 평가 배열 → 축별 평균(고정 축 순서). n<minSample 축은 avg=null. */
export function aggregateAxisStats(
  rows: Array<{ axis: string; score: number }>,
  minSample: number = AXIS_MIN_SAMPLE,
): AxisStat[] {
  const acc: Record<string, { sum: number; n: number }> = {};
  for (const r of rows) {
    if (!isValidAxis(r.axis) || !isValidScore(r.score)) continue;
    (acc[r.axis] ??= { sum: 0, n: 0 });
    acc[r.axis].sum += r.score;
    acc[r.axis].n += 1;
  }
  return RATING_AXES.map((axis) => {
    const a = acc[axis];
    const gated = !!a && a.n >= minSample;
    return {
      axis,
      label: AXIS_LABEL[axis],
      count: a?.n ?? 0,
      avg: gated ? Math.round((a!.sum / a!.n) * 10) / 10 : null,
    };
  });
}
