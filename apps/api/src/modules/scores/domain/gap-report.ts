/**
 * 격차 리포트 v1 — janus_report 규약의 첫 구현(실행계획서 W4 · 접합계약 C5).
 * 순수 도메인: 학생 성적(janus_score.nb=전국누백) + 목표 컷(nb)만으로 격차·근거·처방을 산출.
 * 저작권 배치표 데이터는 넣지 않는다(C6) — 목표 컷은 입력으로 받는다(배치표/janus_goal 에서 전달).
 *
 * C5 필수: evidence[]의 각 항목에 신뢰도 relTier(어디가 실측·다년·추정) 포함.
 * 업셀 윤리(사업기획서 §9): 처방에 "무료로 할 수 있는 것"을 항상 포함.
 */
import type { JanusScore } from './janus-score';

export type RelTier = 'measured' | 'multiyear' | 'estimated'; // 어디가 실측 · 다년 앵커 · 추정
export const REL_TIER_LABEL: Record<RelTier, string> = {
  measured: '어디가 실측',
  multiyear: '다년 앵커',
  estimated: '추정',
};

export interface JanusEvidence {
  claim: string;
  source: string;
  relTier: RelTier; // C5 필수
}

export interface GapTarget {
  univ: string;
  dept: string;
  cutNb: number; // 목표 70%컷/지원가능선 — 전국누백(%). 낮을수록 상위.
  track?: string;
}

export type GapBand = '안정' | '적정' | '소신' | '상향';

export interface JanusReport {
  kind: 'gap';
  version: 'v1';
  generatedFor: { gye: '이과' | '문과' | null; nb: number };
  target: GapTarget;
  gap: {
    deltaNb: number; // score.nb - target.cutNb (양수 = 목표까지 부족)
    shortfall: number; // max(0, deltaNb)
    band: GapBand;
    admitProbHint: number | null; // 참고 합격률(%) — 근거가 있을 때만(컷 근접). 없으면 null.
    message: string;
  };
  evidence: JanusEvidence[];
  prescription: {
    headline: string;
    actions: Array<{ label: string; to: string; ctaId?: string; free?: boolean }>;
  };
  disclaimer: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function bandOf(delta: number): GapBand {
  if (delta <= -0.5) return '안정';
  if (delta <= 0) return '적정';
  if (delta <= 0.5) return '소신';
  return '상향';
}

// 컷 근접(작년 70%컷 부근)일 때만 백테스트 합격률(≈37%)을 참고값으로 노출 — 그 외엔 정량 단언 회피.
function admitHint(delta: number): number | null {
  return delta >= -0.2 && delta <= 0.3 ? 37 : null;
}

function bandHeadline(band: GapBand, target: GapTarget, shortfall: number): string {
  switch (band) {
    case '안정':
      return `${target.univ} ${target.dept} — 현재 위치가 목표 컷보다 여유 있습니다. 유지 전략이 핵심입니다.`;
    case '적정':
      return `${target.univ} ${target.dept} — 목표 컷 위에 있으나 변동성 구간입니다. 안정화가 필요합니다.`;
    case '소신':
      return `${target.univ} ${target.dept}까지 전국누백 ${shortfall} 부족 — 근접했습니다. 과목별 격차를 좁히면 도달 가능합니다.`;
    default:
      return `${target.univ} ${target.dept}까지 전국누백 ${shortfall} 부족 — 격차가 큽니다. 우선순위를 정한 집중 전략이 필요합니다.`;
  }
}

/**
 * 격차 리포트 생성(순수). nb 가 없는 성적(표점만)은 호출 측에서 걸러야 한다.
 * @param score janus_score (nb 필수)
 * @param target 목표 대학·학과·컷(전국누백)
 */
export function buildGapReport(score: JanusScore, target: GapTarget): JanusReport {
  const nb = score.nb!;
  const delta = round2(nb - target.cutNb);
  const shortfall = Math.max(0, delta);
  const band = bandOf(delta);
  const admitProbHint = admitHint(delta);

  const message =
    delta <= 0
      ? `현재 전국누백 ${nb}% — 목표 컷(${target.cutNb}%)보다 ${round2(-delta)} 앞섭니다.`
      : `현재 전국누백 ${nb}% — 목표 컷(${target.cutNb}%)까지 ${shortfall} 부족합니다.`;

  const evidence: JanusEvidence[] = [
    {
      claim: '작년 70%컷 지원자의 실제 합격률은 약 37%였습니다 — 컷=합격이 아닙니다.',
      source: '백테스트 1,851명(어디가 70%컷 캘리브레이션 +4.2%p)',
      relTier: 'multiyear',
    },
    {
      claim: '예측 오차(MAE)는 점수대에 따라 약 3~9 수준입니다. 컷 근접 구간일수록 실채점·대학별 변환 발표 후 재확인이 필요합니다.',
      source: '다년 교차검증(계열보정 MAE 4.96)',
      relTier: 'measured',
    },
    {
      claim: `목표 컷(${target.univ} ${target.dept}) 전국누백 ${target.cutNb}% 기준. 대학별 변환표준점수 발표 후 확정됩니다.`,
      source: '배치표 지원가능선(입력값)',
      relTier: 'estimated',
    },
  ];

  const actions: JanusReport['prescription']['actions'] = [
    { label: '무료 커리큘럼 카드 — 격차 원인별 처방 보기', to: '/services', free: true },
    { label: '배치표에서 다른 학과와 비교', to: '/placement', free: true },
    { label: '1:1 전략 상담 예약 — 격차 근거 위 상담', to: '/consulting/apply', ctaId: 'consult-reserve' },
  ];

  return {
    kind: 'gap',
    version: 'v1',
    generatedFor: { gye: score.gye, nb },
    target,
    gap: { deltaNb: delta, shortfall, band, admitProbHint, message },
    evidence,
    prescription: { headline: bandHeadline(band, target, shortfall), actions },
    disclaimer:
      '본 리포트는 지난 입시 데이터 기반 추정이며 실제 합격을 보장하지 않습니다. 무료로 시작할 수 있는 처방을 우선 안내합니다.',
  };
}
