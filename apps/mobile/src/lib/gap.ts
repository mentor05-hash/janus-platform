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
  /** 회차 방향(3회 이상) — 향상 중인 학생을 '흔들림'으로 프레이밍하지 않기 위한 분기 키. */
  direction: 'improving' | 'worsening' | 'mixed' | null;
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

/**
 * 서버 격차 리포트(janus_report kind=gap) — **트렁크 `JanusReport` 봉투 그대로**.
 *
 * ⚠ 2026-07-30 정정. 이전 타입(`GapPayload`: goal/current/gap.bySubject/prescriptions)은
 * `GET /me/reports/gap` 이라는 **없는 경로**의 가상 계약이었다. 호출은 항상 실패했고
 * `.catch(() => setReport(null))` 이 삼켜서, 모바일 격차 화면은 만들어진 날부터 계속
 * 클라이언트 계산 폴백으로만 돌았다. 서버는 그 사이 **다른 이름·다른 모양**으로 구현돼 있었다:
 *   · 생성 `POST /scores/gap-report` (웹 '목표 대학 격차'가 호출)
 *   · 이력 `GET /me/reports?kind=gap&limit=N` — 행의 `payload` 가 이 타입
 *
 * 이 봉투에는 **과목별 격차가 없다**. 단위가 다르기 때문이다 — 서버 리포트는 목표 학과 컷 대비
 * 전국누백(정시)·내신등급(수시) 한 값이고, 과목별 바는 회차 과목 점수(0~100)에서 나온다.
 * 그래서 둘은 대체 관계가 아니라 **층이 다르다**: 전략층(목표 대학 대비)은 서버, 실행층(과목별)은
 * `computeGapModel`. 한쪽으로 억지로 합치면 척도가 섞여 숫자가 거짓이 된다.
 */
export type JanusGapReport = {
  kind: 'gap';
  version: string;
  mode: 'jeongsi' | 'susi';
  unit: { label: string; suffix: string };
  generatedFor: { gye: string | null; value: number };
  target: { univ: string; dept: string; cut: number; track?: string };
  // band 는 구 포크 어휘(영문)일 수 있어 string 으로 받고 normalizeBand 로 정본화한다.
  gap: { delta: number; shortfall: number; band: string; admitProbHint: number | null; message: string };
  volatility: { count: number; consistent: boolean; smallSample: boolean; direction: string | null; message: string } | null;
  evidence: { claim: string; source: string; relTier: string }[];
  prescription: { headline: string; actions: { label: string; to: string; ctaId?: string; free?: boolean }[] };
  disclaimer?: string;
};

/** `GET /me/reports?kind=gap` 이력 행. */
export type JanusReportRow = { id: string; kind: string; status: string; created_at: string; payload: JanusGapReport };

const widthPct = (score: number, goalAvg: number | null) =>
  goalAvg != null && goalAvg > 0 ? Math.max(6, Math.min(100, (score / goalAvg) * 100)) : 100;

/**
 * 서버 리포트 → 표시용 요약(전략층). **GapModel 로 변환하지 않는다** —
 * 위 타입 주석대로 단위가 달라, 과목 점수 기반 모델에 끼워 넣으면 숫자가 거짓이 된다.
 */
export function summarizeReport(p: JanusGapReport) {
  const goal = [p.target.univ, p.target.dept, p.target.track].filter(Boolean).join(' · ');
  return {
    goal,
    band: normalizeBand(p.gap.band),
    /** 목표 컷까지 부족분(0 이면 도달). 단위는 `unit.suffix`(정시 %, 수시 등급). */
    shortfall: p.gap.shortfall,
    unit: p.unit,
    myValue: p.generatedFor.value,
    cut: p.target.cut,
    message: p.gap.message,
    /** 회차가 흔들려 판정이 갈리는 경우에만 문장이 있다(O108). */
    volatility: p.volatility && !p.volatility.consistent ? p.volatility.message : null,
    evidence: p.evidence,
    headline: p.prescription.headline,
  };
}

/** Trend → 격차 모델(과목별 격차·약점 과목). 처방 문구 구성에 재사용. */
export function computeGapModel(trend: Trend | null): GapModel | null {
  if (!trend) return null;
  const pts = trend.points;
  const last = pts[pts.length - 1];
  const goalAvg = trend.goal?.avg ?? null;
  const lastAvg = last?.avg ?? null;
  const scored = (last?.subjects ?? []).filter((s) => s.score != null);
  // 수능 자가입력(O65 표점 모드) 회차는 과목 점수가 표준점수(100 초과)여서 목표 평균(0~100)과 척도가 다르다.
  // 그대로 비교하면 격차가 음수로 나와 전 과목이 '목표 도달' 로 뒤집히므로, 과목별 격차는 계산하지 않는다.
  const scaleMismatch = scored.some((s) => (s.score as number) > 100);
  // **총평도 같이 막는다** — 과목별에만 가드를 두면 표점 평균(예: 98.8) vs 목표 평균(90) 비교가 남아
  // 화면에 '목표 도달' 이라는 거짓 판정이 뜬다(웹 lib 과 동일 수정 — 한쪽만 고치면 갈라진다).
  const overallGap = !scaleMismatch && goalAvg != null && lastAvg != null ? r1(goalAvg - lastAvg) : null;
  const overallBand = overallGap != null && goalAvg != null ? bandOf(overallGap, goalAvg) : null;
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
