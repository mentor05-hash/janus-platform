import type { Trend, TrendPoint } from '../screens/ScoreTrendView';

/** 격차 리포트 순수 로직(RN 무관 — 테스트 가능). 신호등 판정·격차 모델. */

/**
 * 밴드 어휘 = **트렁크 gap-report 정본**(O102). 표시·색·서버 응답이 모두 이 값을 쓴다.
 * (구 로컬 포크 'stable'|'fit'|'reach'|'high' 는 폐기 — normalizeBand 로 하위호환만 흡수한다.)
 */
export type Band = '안정' | '적정' | '소신' | '상향';

/** 신호등 색 — 웹 tokens 와 정렬된 브랜드 고정값(라이트/다크 공통). */
export const BAND_COLOR: Record<Band, string> = {
  안정: '#2a8a5f', 적정: '#57a86a', 소신: '#cf9f2f', 상향: '#d06b52',
};

/** C5 근거 신뢰도(트렁크 정본 택소노미) 표시 라벨 — P0-4 초안의 A|B|C 등급이 아니다. */
export const REL_TIER_LABEL: Record<string, string> = { measured: '실측', multiyear: '다년', estimated: '추정' };

const LEGACY_BAND: Record<string, Band> = { stable: '안정', fit: '적정', reach: '소신', high: '상향' };
/** 구 포크 어휘(영문)를 정본으로 흡수 — 서버가 구 payload 를 주더라도 색·라벨이 깨지지 않게. */
export function normalizeBand(v: string | null | undefined): Band | null {
  if (!v) return null;
  return (LEGACY_BAND[v] ?? (v in BAND_COLOR ? (v as Band) : null));
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 격차(목표−현재)를 **목표 대비 비율**로 4구간 판정하고 정본 어휘로 라벨링한다.
 *
 * ⚠ 임계값은 API 정본(gap-report.ts)과 다르다 — 단위가 다르기 때문이다:
 *   · API 전략 리포트: 누백(%)·내신등급 → 절대 delta ±0.5 기준
 *   · 이 실행층: 과목 점수(0~100) → 비율 8%/25% 기준
 * 100점 척도에 ±0.5 절대 기준을 쓰면 1점 부족도 '상향'이 되어 무의미해진다.
 * 즉 **어휘·색은 통일하고 임계값은 척도에 맞춘다**(밴드의 뜻은 척도와 무관하게 같다).
 */
export function bandOf(gap: number, target: number): Band {
  if (gap <= 0) return '안정';
  const pct = target > 0 ? gap / target : gap;
  if (pct <= 0.08) return '적정';
  if (pct <= 0.25) return '소신';
  return '상향';
}

/** 목표 후보 — GET /me/goal/candidates */
export type GoalCandidate = { id: string; mode: 'jeongsi' | 'susi'; univ: string; dept: string; track: string | null; cut: number; note: string | null };
/**
 * 후보별 회차 변동성(O108) — **컷에 종속된 3키만** 온다.
 * count·best·worst·spread·message 는 후보 불변값이라 후보 3개에 같은 문장이 3번 실리지 않도록
 * 서버가 목록 레벨(spread·smallSample)로 올려 보낸다. 밴드 칩은 계속 **점 판정**(band)이고,
 * 뒤집힘은 보조 줄로 덧붙일 뿐 칩을 대체하지 않는다(gap.band = 정본 계약).
 */
export type CandVolatility = { bestBand: Band; worstBand: Band; consistent: boolean };

/** 후보 비교 리포트 — GET /me/goal/candidates/report. band 는 트렁크 정본 어휘. */
export type GoalCandidateReport = {
  mode: 'jeongsi' | 'susi';
  myValue: number;
  unit: { label: string; suffix: string };
  spread: { count: number; best: number; worst: number; spread: number } | null;
  /** 표본 과소(3회 미만) — 정본 buildVolatility 기준. 클라에서 count<3 을 재구현하지 않는다(임계값 드리프트 방지). */
  smallSample: boolean | null;
  /** 판정이 갈리는 후보 수 — 0이면 '흔들렸지만 순서는 그대로'로 안내한다. */
  flipCount: number;
  /** 수시에 변동 표시가 없는 사유(서버 고정 문구 — 웹·모바일 카피가 갈라지지 않게). */
  volatilityNote: string | null;
  candidates: { id: string; univ: string; dept: string; track: string | null; cut: number; band: Band; delta: number; shortfall: number; message: string; volatility: CandVolatility | null }[];
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
  // band 는 구 포크 어휘(영문)일 수 있어 string 으로 받고 normalizeBand 로 정본화한다.
  gap: { value: number | null; band: string | null; bySubject: { subject: string; score: number; value: number | null; band: string | null }[] };
  prescriptions: { title: string; description: string; service: string; href: string; ctaLabel: string; primary?: boolean }[];
};

const widthPct = (score: number, goalAvg: number | null) =>
  goalAvg != null && goalAvg > 0 ? Math.max(6, Math.min(100, (score / goalAvg) * 100)) : 100;

/** 서버 payload → 격차 모델(클라 계산과 동일 형태). last(추세 최신점)는 차트/배치표시용으로 trend 에서 보완. */
export function modelFromPayload(p: GapPayload, last?: TrendPoint): GapModel {
  const goalAvg = p.goal.avg;
  // 정렬은 computeGapModel 과 동일(격차 큰 순) — weakest 가 '응답 순서상 첫 항목' 이 아니라 '격차 최대' 를 가리키게.
  const subjects = p.gap.bySubject
    .map((s) => ({ subject: s.subject, score: s.score, gap: s.value, band: normalizeBand(s.band), pct: widthPct(s.score, goalAvg) }))
    .sort((a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity));
  return {
    last,
    goalAvg,
    lastAvg: p.current.avg,
    overallGap: p.gap.value,
    overallBand: normalizeBand(p.gap.band),
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
