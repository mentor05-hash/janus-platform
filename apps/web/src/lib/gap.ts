/**
 * 과목별 격차(실행층) 순수 로직 — 목표 평균 대비 과목 점수 격차·신호등 판정.
 *
 * 위치: 이 파일은 `apps/mobile/src/lib/gap.ts` 의 웹 대응본이다(⑤-1 academic 과 같은 앱별 lib 관례).
 *   **둘 중 하나를 고치면 반대쪽도 함께 고쳐야 한다** — 임계값은 gap.test.ts 가 고정한다.
 *
 * 고도 구분(O102):
 *   · 전략 리포트(정본) = API `POST /scores/gap-report` — 누백(%)·내신등급 vs 목표 컷. 웹 `/student/placement/gap`.
 *   · 이 실행층      = 과목 점수(0~100) vs 목표 평균. 웹 `/student/gap`. 서버 저장 없이 추이에서 클라 계산.
 */

/** 밴드 어휘 = 트렁크 gap-report 정본. 표시·색이 모두 이 값을 쓴다. */
export type Band = '안정' | '적정' | '소신' | '상향';

/** 신호등 색 — 모바일 lib/gap 의 BAND_COLOR 와 동일 값(브랜드 고정). */
export const BAND_COLOR: Record<Band, string> = {
  안정: '#2a8a5f', 적정: '#57a86a', 소신: '#cf9f2f', 상향: '#d06b52',
};

/**
 * 격차(목표−현재)를 **목표 대비 비율**로 4구간 판정하고 정본 어휘로 라벨링한다.
 *
 * ⚠ 임계값이 API 정본(gap-report.ts 의 절대 delta ±0.5)과 다른 이유: 단위가 다르다.
 *   여기는 과목 점수(0~100)라서 ±0.5 절대 기준을 쓰면 1점 부족도 '상향'이 되어 무의미하다.
 *   즉 어휘·색은 통일하고 임계값은 척도에 맞춘다(밴드의 뜻은 척도와 무관하게 같다).
 */
export function bandOf(gap: number, target: number): Band {
  if (gap <= 0) return '안정';
  const pct = target > 0 ? gap / target : gap;
  if (pct <= 0.08) return '적정';
  if (pct <= 0.25) return '소신';
  return '상향';
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** GET /me/scores/trend 응답에서 이 로직이 쓰는 부분만(구조적 타입). */
export type TrendLike = {
  goal?: { tier?: string | null; avg?: number | null; university?: string | null; department?: string | null } | null;
  points: Array<{
    period: string;
    examType: string | null;
    avg: number | null;
    nb?: number | null;
    subjects?: Array<{ subject: string; score: number | null }> | null;
  }>;
};

export type SubjectGap = { subject: string; score: number; gap: number | null; band: Band | null; pct: number };

export type SubjectGapModel = {
  goalAvg: number | null;
  lastAvg: number | null;
  lastLabel: string | null;
  overallGap: number | null;
  overallBand: Band | null;
  subjects: SubjectGap[];
  /** 최신 회차 과목 점수가 표준점수(100 초과)라 목표 평균(0~100)과 척도가 달라 계산을 생략한 경우. */
  scaleMismatch: boolean;
  weakest: SubjectGap | null;
};

/** 바 길이(%) — 목표를 100% 로 본 현재 점수 비율. 최소 6% 로 라벨 가독 확보. */
const widthPct = (score: number, goalAvg: number | null) =>
  goalAvg != null && goalAvg > 0 ? Math.max(6, Math.min(100, (score / goalAvg) * 100)) : 100;

/** 추이 → 과목별 격차 모델(최신 회차 기준). 목표 평균이 없으면 subjects 는 빈 배열. */
export function computeSubjectGaps(trend: TrendLike | null): SubjectGapModel | null {
  if (!trend) return null;
  const last = trend.points[trend.points.length - 1];
  if (!last) return null;
  const goalAvg = trend.goal?.avg ?? null;
  const lastAvg = last.avg ?? null;

  const scored = (last.subjects ?? []).filter((s): s is { subject: string; score: number } => s.score != null);
  // 수능 자가입력(표점 모드) 회차는 과목 점수가 100 을 넘어 목표 평균과 척도가 다르다 → 과목별 계산 생략.
  const scaleMismatch = scored.some((s) => s.score > 100);
  // **총평도 같이 막는다.** 표점 평균(예: 98.8)을 목표 평균(90)과 비교하면 격차가 음수로 나와
  // '목표 도달'로 **판정이 뒤집힌다** — 과목별에만 가드를 두고 총평을 열어두면 화면에서 거짓 판정이 남는다.
  const overallGap = !scaleMismatch && goalAvg != null && lastAvg != null ? r1(goalAvg - lastAvg) : null;
  const overallBand = overallGap != null && goalAvg != null ? bandOf(overallGap, goalAvg) : null;
  const subjects: SubjectGap[] =
    scaleMismatch || goalAvg == null
      ? []
      : scored
          .map((s) => {
            const gap = r1(goalAvg - s.score);
            return { subject: s.subject, score: s.score, gap, band: bandOf(gap, goalAvg), pct: widthPct(s.score, goalAvg) };
          })
          .sort((a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity));

  return {
    goalAvg,
    lastAvg,
    lastLabel: last.examType ?? last.period ?? null,
    overallGap,
    overallBand,
    subjects,
    scaleMismatch,
    weakest: subjects.find((s) => (s.gap ?? 0) > 0) ?? null,
  };
}

/**
 * 회차 변동 폭(평균 기준) — 시험은 1회성이라 컨디션·난이도로 점수가 흔들린다.
 * 한 회차만 보고 밴드를 단정하지 않도록 분포를 함께 노출한다(저장값의 기술통계일 뿐 예측 아님).
 * 평균은 **높을수록 상위**라서 best=max·worst=min (누백과 방향이 반대).
 */
export function avgSpread(trend: TrendLike | null): { count: number; best: number; worst: number; spread: number } | null {
  // ⚠ **표준점수 회차를 섞지 않는다.** 수능 자가입력(O65 표점 모드) 회차는 과목 점수가 100 을 넘어
  // 평균도 원점수 척도가 아니다(예: 국어 131·수학 135 → 평균 98.8). 원점수 회차(평균 75)와 함께
  // min/max 를 잡으면 '최근 4회 평균 75~98.8(변동 폭 23.8)' 처럼 **척도가 섞인 무의미한 범위**가 나온다.
  // 회차별 격차에는 이미 같은 규칙의 가드가 있다(computeSubjectGaps 의 scaleMismatch) — 범위에도 적용한다.
  const vals = (trend?.points ?? [])
    .filter((p) => !(p.subjects ?? []).some((s) => s.score != null && s.score > 100))
    .map((p) => p.avg)
    .filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  const best = Math.max(...vals);
  const worst = Math.min(...vals);
  return { count: vals.length, best, worst, spread: r1(best - worst) };
}
