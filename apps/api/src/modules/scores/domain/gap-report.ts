/**
 * 격차 리포트 (janus_report 규약·C5) — 실행계획서 W4 + 수시 확장.
 * 순수 도메인: 학생 지표 + 목표 컷만으로 격차·근거·처방 산출. 저작권 배치표 데이터 무반입(C6).
 *
 * 두 모드 공통(둘 다 "낮을수록 상위"):
 *   · jeongsi: 전국누백(%) — 정시 수능 위주
 *   · susi   : 내신 평균등급(1~9) — 수시 학생부 위주
 * C5 필수: evidence[] 각 항목에 신뢰도 relTier(어디가 실측·다년·추정) 포함.
 * 업셀 윤리(사업기획서 §9): 처방에 "무료로 할 수 있는 것"을 항상 포함.
 */

export type GapMode = 'jeongsi' | 'susi';
export type RelTier = 'measured' | 'multiyear' | 'estimated';
export const REL_TIER_LABEL: Record<RelTier, string> = { measured: '어디가 실측', multiyear: '다년 앵커', estimated: '추정' };

export interface JanusEvidence {
  claim: string;
  source: string;
  relTier: RelTier; // C5 필수
}

export interface GapTarget {
  univ: string;
  dept: string;
  cut: number; // 목표 컷 — 모드 단위(정시=전국누백%, 수시=내신등급)
  track?: string;
}

export interface GapInput {
  mode: GapMode;
  gye: '이과' | '문과' | null;
  myValue: number; // 정시=전국누백, 수시=내신 평균등급
  target: GapTarget;
  /**
   * 최근 회차 값들(같은 단위, 최신 포함). 있으면 **변동성 판정**을 함께 산출한다(O108).
   * 시험은 1회성이라 컨디션·난이도로 흔들리므로 한 점만 보고 밴드를 단정하지 않기 위한 입력.
   * 저장된 값의 기술통계만 쓴다 — 예측·환산은 하지 않는다(O65).
   */
  recent?: number[];
}

export type GapBand = '안정' | '적정' | '소신' | '상향';

export interface JanusReport {
  kind: 'gap';
  version: 'v1';
  mode: GapMode;
  unit: { label: string; suffix: string };
  generatedFor: { gye: '이과' | '문과' | null; value: number };
  target: GapTarget;
  gap: {
    delta: number; // myValue - target.cut (양수 = 목표까지 부족)
    shortfall: number; // max(0, delta)
    band: GapBand; // **점 판정**(최신 회차 기준) — 기존 계약 유지
    admitProbHint: number | null;
    message: string;
  };
  /**
   * 회차 변동성 판정(O108) — recent 가 2회 이상일 때만. 없으면 null(기존 페이로드와 호환).
   * band 를 대체하지 않고 **덧붙인다**: 이미 저장된 janus_report 이력과 소비자가 그대로 동작해야 하기 때문.
   * n 이 작아(보통 2~5회) 표준편차·신뢰구간은 통계적으로 무의미하므로 **산출하지 않는다** —
   * 대신 '최고/최저 회차로 각각 판정하면 밴드가 뒤집히는가'라는, 데이터가 실제로 답할 수 있는 질문만 답한다.
   */
  volatility: {
    count: number;
    best: number; // 가장 유리한 회차 값(정시 누백·수시 등급 모두 '낮을수록 상위')
    worst: number;
    spread: number; // worst - best
    bestBand: GapBand;
    worstBand: GapBand;
    /** 최고·최저 회차의 밴드가 같은가 — false 면 회차에 따라 판정이 흔들린다는 뜻. */
    consistent: boolean;
    /** 표본이 적어(3회 미만) 해석에 특히 주의가 필요한 경우. */
    smallSample: boolean;
    message: string;
  } | null;
  evidence: JanusEvidence[];
  prescription: {
    headline: string;
    actions: Array<{ label: string; to: string; ctaId?: string; free?: boolean }>;
  };
  disclaimer: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const UNIT: Record<GapMode, { label: string; suffix: string }> = {
  jeongsi: { label: '전국누백', suffix: '%' },
  susi: { label: '내신 등급', suffix: '등급' },
};

function bandOf(delta: number): GapBand {
  if (delta <= -0.5) return '안정';
  if (delta <= 0) return '적정';
  if (delta <= 0.5) return '소신';
  return '상향';
}

/**
 * 회차 변동성 판정(O108) — 최고·최저 회차로 각각 밴드를 매겨 '판정이 뒤집히는지'만 답한다.
 * 왜 σ·신뢰구간이 아닌가: 실제 회차 수가 보통 2~5회라 분산 추정이 통계적으로 무의미하고,
 * 정밀한 수치를 보여주면 근거 신뢰도(C5)·예측한계 표시 원칙에 어긋난다.
 * 정시 누백·수시 등급 모두 '낮을수록 상위'라 best=min, worst=max 로 동일하게 처리된다.
 */
function buildVolatility(recent: number[] | undefined, cut: number, unitLabel: string, suffix: string): JanusReport['volatility'] {
  const vals = (recent ?? []).filter((v) => Number.isFinite(v));
  if (vals.length < 2) return null; // 1회뿐이면 '변동'을 말할 근거가 없다
  const best = Math.min(...vals);
  const worst = Math.max(...vals);
  const bestBand = bandOf(round2(best - cut));
  const worstBand = bandOf(round2(worst - cut));
  const consistent = bestBand === worstBand;
  const smallSample = vals.length < 3;
  const spread = round2(worst - best);
  const message = consistent
    ? `최근 ${vals.length}회 ${unitLabel} ${best}~${worst}${suffix}(변동 폭 ${spread}) — 어느 회차로 봐도 '${bestBand}' 구간이에요.`
    : `최근 ${vals.length}회 ${unitLabel} ${best}~${worst}${suffix}(변동 폭 ${spread}) — 회차에 따라 '${bestBand}'에서 '${worstBand}'까지 갈립니다. 한 회차 결과만으로 단정하지 마세요.`;
  return { count: vals.length, best, worst, spread, bestBand, worstBand, consistent, smallSample, message };
}

// 정시(어디가 70%컷 백테스트)만 컷 근접 구간 합격률 힌트(≈37%). 수시는 정량 단언 회피.
function admitHint(mode: GapMode, delta: number): number | null {
  return mode === 'jeongsi' && delta >= -0.2 && delta <= 0.3 ? 37 : null;
}

function bandHeadline(band: GapBand, t: GapTarget, shortfall: number, unitLabel: string): string {
  switch (band) {
    case '안정':
      return `${t.univ} ${t.dept} — 현재 위치가 목표 컷보다 여유 있습니다. 유지 전략이 핵심입니다.`;
    case '적정':
      return `${t.univ} ${t.dept} — 목표 컷 위에 있으나 변동성 구간입니다. 안정화가 필요합니다.`;
    case '소신':
      return `${t.univ} ${t.dept}까지 ${unitLabel} ${shortfall} 부족 — 근접했습니다. 격차를 좁히면 도달 가능합니다.`;
    default:
      return `${t.univ} ${t.dept}까지 ${unitLabel} ${shortfall} 부족 — 격차가 큽니다. 우선순위를 정한 집중 전략이 필요합니다.`;
  }
}

function evidenceFor(mode: GapMode, t: GapTarget, unit: { label: string; suffix: string }): JanusEvidence[] {
  const cutEv: JanusEvidence = {
    claim: `목표 컷(${t.univ} ${t.dept}) ${unit.label} ${t.cut}${unit.suffix} 기준. 발표 입결/변환 확정 후 재확인이 필요합니다.`,
    source: mode === 'jeongsi' ? '배치표 지원가능선(입력값)' : '수시 입결 지원가능선(입력값)',
    relTier: 'estimated',
  };
  if (mode === 'jeongsi') {
    return [
      { claim: '작년 70%컷 지원자의 실제 합격률은 약 37%였습니다 — 컷=합격이 아닙니다.', source: '백테스트 1,851명(어디가 70%컷 캘리브레이션 +4.2%p)', relTier: 'multiyear' },
      { claim: '예측 오차(MAE)는 점수대에 따라 약 3~9 수준입니다. 컷 근접일수록 실채점·대학별 변환 발표 후 재확인이 필요합니다.', source: '다년 교차검증(계열보정 MAE 4.96)', relTier: 'measured' },
      cutEv,
    ];
  }
  return [
    { claim: '수시 입결은 대학 발표 2024~2026 다년치를 사용합니다. 전형·수능최저 충족 여부가 실제 합격을 크게 가릅니다.', source: '대학발표 입결 17,031개 모집단위', relTier: 'multiyear' },
    { claim: '수능최저 파서 검증: 합격사례 충족 99.4%. 최저 미충족은 컷 무관하게 불합격이므로 별도 점검이 필요합니다.', source: '최저 검증(합격사례 99.4%)', relTier: 'measured' },
    cutEv,
  ];
}

/** 격차 리포트 생성(순수). myValue(정시=누백/수시=등급)와 목표 컷으로 밴드·근거·처방 산출. */
export function buildGapReport(input: GapInput): JanusReport {
  const { mode, gye, myValue, target } = input;
  const unit = UNIT[mode];
  const delta = round2(myValue - target.cut);
  const shortfall = Math.max(0, delta);
  const band = bandOf(delta);
  const admitProbHint = admitHint(mode, delta);

  const message =
    delta <= 0
      ? `현재 ${unit.label} ${myValue}${unit.suffix} — 목표 컷(${target.cut}${unit.suffix})보다 ${round2(-delta)} 앞섭니다.`
      : `현재 ${unit.label} ${myValue}${unit.suffix} — 목표 컷(${target.cut}${unit.suffix})까지 ${shortfall} 부족합니다.`;

  const actions: JanusReport['prescription']['actions'] = [
    { label: '무료 커리큘럼 카드 — 격차 원인별 처방 보기', to: '/services', free: true },
    { label: mode === 'jeongsi' ? '배치표에서 다른 학과와 비교' : '수시 입결에서 다른 전형과 비교', to: '/placement', free: true },
    { label: '1:1 전략 상담 예약 — 격차 근거 위 상담', to: '/consulting/apply', ctaId: 'consult-reserve' },
  ];

  return {
    kind: 'gap',
    version: 'v1',
    mode,
    unit,
    generatedFor: { gye, value: myValue },
    target,
    gap: { delta, shortfall, band, admitProbHint, message },
    volatility: buildVolatility(input.recent, target.cut, unit.label, unit.suffix),
    evidence: evidenceFor(mode, target, unit),
    prescription: { headline: bandHeadline(band, target, shortfall, unit.label), actions },
    disclaimer:
      '본 리포트는 지난 입시 데이터 기반 추정이며 실제 합격을 보장하지 않습니다. 무료로 시작할 수 있는 처방을 우선 안내합니다.',
  };
}
