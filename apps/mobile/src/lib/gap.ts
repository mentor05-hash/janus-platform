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

/**
 * 트렁크 gap-report 정본 밴드 어휘(O102) — 서버가 이 한글 값을 그대로 준다.
 * 위의 로컬 Band(stable/fit/reach/high)는 클라 계산 폴백용 포크이며 O102 가 '하드 비호환'으로 기록했다.
 * **신규 화면은 이 어휘만 쓴다** — 포크를 새 코드로 확산시키지 않기 위해 여기 한 곳에 모아 둔다.
 */
export type TrunkBand = '안정' | '적정' | '소신' | '상향';
/** 색은 위 SIGNAL(포크 어휘)과 동일 값 — 같은 신호등을 두 어휘가 공유한다. */
export const TRUNK_BAND_COLOR: Record<string, string> = {
  안정: '#2a8a5f', 적정: '#57a86a', 소신: '#cf9f2f', 상향: '#d06b52',
};
/** C5 근거 신뢰도(measured/multiyear/estimated) 표시 라벨 — P0-4 초안의 A/B/C 가 아니라 정본 어휘. */
export const REL_TIER_LABEL: Record<string, string> = { measured: '실측', multiyear: '다년', estimated: '추정' };

/** 목표 후보 — GET /me/goal/candidates */
export type GoalCandidate = { id: string; mode: 'jeongsi' | 'susi'; univ: string; dept: string; track: string | null; cut: number; note: string | null };
/** 후보 비교 리포트 — GET /me/goal/candidates/report. band 는 트렁크 정본 어휘. */
export type GoalCandidateReport = {
  mode: 'jeongsi' | 'susi';
  myValue: number;
  unit: { label: string; suffix: string };
  spread: { count: number; best: number; worst: number; spread: number } | null;
  candidates: { id: string; univ: string; dept: string; track: string | null; cut: number; band: TrunkBand; delta: number; shortfall: number; message: string }[];
  admitHintNote: string | null;
  evidence: { claim: string; source: string; relTier: string }[];
  disclaimer: string;
};

export type GapModel = {
  last?: TrendPoint;
  goalAvg: number | null;
  lastAvg: number | null;
  overallGap: number | null;
  overallBand: Band | null;
  subjects: { subject: string; score: number; gap: number | null; band: Band | null; pct: number }[];
  /** 과목 점수가 표준점수(100 초과)라 목표 평균(0~100)과 척도가 달라 과목별 격차를 계산하지 않은 경우. */
  scaleMismatch: boolean;
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
  // 정렬은 computeGapModel 과 동일(격차 큰 순) — weakest 가 '응답 순서상 첫 항목' 이 아니라 '격차 최대' 를 가리키게.
  const subjects = p.gap.bySubject
    .map((s) => ({ subject: s.subject, score: s.score, gap: s.value, band: s.band, pct: widthPct(s.score, goalAvg) }))
    .sort((a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity));
  return {
    last,
    goalAvg,
    lastAvg: p.current.avg,
    overallGap: p.gap.value,
    overallBand: p.gap.band,
    subjects,
    scaleMismatch: false, // 서버 payload 는 avg 기준으로 산출되므로 척도 불일치 없음
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
  const scored = (last?.subjects ?? []).filter((s) => s.score != null);
  // 수능 자가입력(O65 표점 모드) 회차는 과목 점수가 표준점수(100 초과)여서 목표 평균(0~100)과 척도가 다르다.
  // 그대로 비교하면 격차가 음수로 나와 전 과목이 '목표 도달' 로 뒤집히므로, 과목별 격차는 계산하지 않는다(총평·추세만).
  const scaleMismatch = scored.some((s) => (s.score as number) > 100);
  const subjects = scaleMismatch
    ? []
    : scored
        .map((s) => {
          const score = s.score as number;
          const gap = goalAvg != null ? r1(goalAvg - score) : null;
          const band = gap != null && goalAvg != null ? bandOf(gap, goalAvg) : null;
          const pct = goalAvg != null && goalAvg > 0 ? Math.max(6, Math.min(100, (score / goalAvg) * 100)) : 100;
          return { subject: s.subject, score, gap, band, pct };
        })
        .sort((a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity));
  const weakest = subjects.find((s) => (s.gap ?? 0) > 0) ?? null;
  return { last, goalAvg, lastAvg, overallGap, overallBand, subjects, scaleMismatch, weakest, tier: trend.goal?.tier ?? null, university: trend.goal?.university ?? null, department: trend.goal?.department ?? null };
}
