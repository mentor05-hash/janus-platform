import type { Trend, TrendPoint } from '../screens/ScoreTrendView';

/** 격차 리포트 순수 로직(RN 무관 — 테스트 가능). 신호등 판정·격차 모델. */
export type Band = 'stable' | 'fit' | 'reach' | 'high';

const r1 = (n: number) => Math.round(n * 10) / 10;

/** 격차(목표−현재)를 목표 대비 비율로 4구간 판정 — 점수·등급 척도 무관. */
export function bandOf(gap: number, target: number): Band {
  if (gap <= 0) return 'stable';
  const pct = target > 0 ? gap / target : gap;
  if (pct <= 0.08) return 'fit';
  if (pct <= 0.25) return 'reach';
  return 'high';
}

export type GapModel = {
  last?: TrendPoint;
  goalAvg: number | null;
  lastAvg: number | null;
  overallGap: number | null;
  overallBand: Band | null;
  subjects: { subject: string; score: number; gap: number | null; band: Band | null; pct: number }[];
  weakest: { subject: string; gap: number | null } | null;
  tier: string | null;
  university?: string | null;
  department?: string | null;
};

/** 서버 격차 리포트 payload(janus_report kind=gap) — /me/reports/gap 응답 계약. */
export type GapPayload = {
  version: number;
  period: string | null;
  goal: { tier: string | null; avg: number | null; university: string | null; department: string | null };
  current: { avg: number | null; tier: string | null; line: string | null };
  gap: { value: number | null; band: Band | null; bySubject: { subject: string; score: number; value: number | null; band: Band | null }[] };
  prescriptions: { title: string; description: string; service: string; href: string; ctaLabel: string; primary?: boolean }[];
};

const widthPct = (score: number, goalAvg: number | null) =>
  goalAvg != null && goalAvg > 0 ? Math.max(6, Math.min(100, (score / goalAvg) * 100)) : 100;

/** 서버 payload → 격차 모델(클라 계산과 동일 형태). last(추세 최신점)는 차트/배치표시용으로 trend 에서 보완. */
export function modelFromPayload(p: GapPayload, last?: TrendPoint): GapModel {
  const goalAvg = p.goal.avg;
  const subjects = p.gap.bySubject.map((s) => ({ subject: s.subject, score: s.score, gap: s.value, band: s.band, pct: widthPct(s.score, goalAvg) }));
  return {
    last,
    goalAvg,
    lastAvg: p.current.avg,
    overallGap: p.gap.value,
    overallBand: p.gap.band,
    subjects,
    weakest: subjects.find((s) => (s.gap ?? 0) > 0) ?? null,
    tier: p.goal.tier,
    university: p.goal.university,
    department: p.goal.department,
  };
}

/** Trend → 격차 모델(과목별 격차·약점 과목). 처방 문구 구성에 재사용. */
export function computeGapModel(trend: Trend | null): GapModel | null {
  if (!trend) return null;
  const pts = trend.points;
  const last = pts[pts.length - 1];
  const goalAvg = trend.goal?.avg ?? null;
  const lastAvg = last?.avg ?? null;
  const overallGap = goalAvg != null && lastAvg != null ? r1(goalAvg - lastAvg) : null;
  const overallBand = overallGap != null && goalAvg != null ? bandOf(overallGap, goalAvg) : null;
  const subjects = (last?.subjects ?? [])
    .filter((s) => s.score != null)
    .map((s) => {
      const score = s.score as number;
      const gap = goalAvg != null ? r1(goalAvg - score) : null;
      const band = gap != null && goalAvg != null ? bandOf(gap, goalAvg) : null;
      const pct = goalAvg != null && goalAvg > 0 ? Math.max(6, Math.min(100, (score / goalAvg) * 100)) : 100;
      return { subject: s.subject, score, gap, band, pct };
    })
    .sort((a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity));
  const weakest = subjects.find((s) => (s.gap ?? 0) > 0) ?? null;
  return { last, goalAvg, lastAvg, overallGap, overallBand, subjects, weakest, tier: trend.goal?.tier ?? null, university: trend.goal?.university ?? null, department: trend.goal?.department ?? null };
}
