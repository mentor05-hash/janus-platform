import { buildGapReport, type GapTarget } from './gap-report';
import type { JanusScore } from './janus-score';

const score = (nb: number, gye: '이과' | '문과' = '이과'): JanusScore => ({
  gye, mode: 'nb', nb, period: '2026-06_모평', source: 'test',
});
const target = (cutNb: number): GapTarget => ({ univ: '서울대', dept: '컴퓨터공학', cutNb });

describe('buildGapReport (janus_report v1 · C5)', () => {
  it('목표 컷까지 부족하면 shortfall·message 산출(소신 밴드)', () => {
    const r = buildGapReport(score(2.0), target(1.5));
    expect(r.gap.deltaNb).toBe(0.5);
    expect(r.gap.shortfall).toBe(0.5);
    expect(r.gap.band).toBe('소신');
    expect(r.gap.message).toContain('0.5 부족');
  });

  it('내 위치가 컷보다 앞서면 안정/적정 + 부족 0', () => {
    expect(buildGapReport(score(1.0), target(1.5)).gap.band).toBe('안정'); // delta -0.5
    expect(buildGapReport(score(1.4), target(1.5)).gap.band).toBe('적정'); // delta -0.1
    expect(buildGapReport(score(1.0), target(1.5)).gap.shortfall).toBe(0);
  });

  it('격차 크면 상향 밴드', () => {
    expect(buildGapReport(score(3.0), target(1.5)).gap.band).toBe('상향'); // delta 1.5
  });

  it('C5: 모든 evidence 에 relTier 필수', () => {
    const r = buildGapReport(score(1.6), target(1.5));
    expect(r.evidence.length).toBeGreaterThan(0);
    for (const e of r.evidence) expect(['measured', 'multiyear', 'estimated']).toContain(e.relTier);
  });

  it('컷 근접 구간에서만 합격률 힌트(≈37%) 노출, 그 외 null', () => {
    expect(buildGapReport(score(1.6), target(1.5)).gap.admitProbHint).toBe(37); // delta 0.1
    expect(buildGapReport(score(3.0), target(1.5)).gap.admitProbHint).toBeNull(); // delta 1.5
    expect(buildGapReport(score(0.5), target(1.5)).gap.admitProbHint).toBeNull(); // delta -1.0
  });

  it('업셀 윤리: 처방에 무료 액션 + 상담 CTA(consult-reserve) 포함', () => {
    const r = buildGapReport(score(2.0), target(1.5));
    expect(r.prescription.actions.some((a) => a.free)).toBe(true);
    expect(r.prescription.actions.some((a) => a.ctaId === 'consult-reserve')).toBe(true);
  });

  it('생성 메타(gye·nb)와 kind/version 고정', () => {
    const r = buildGapReport(score(1.53, '문과'), target(1.5));
    expect(r.kind).toBe('gap');
    expect(r.version).toBe('v1');
    expect(r.generatedFor).toEqual({ gye: '문과', nb: 1.53 });
  });
});
