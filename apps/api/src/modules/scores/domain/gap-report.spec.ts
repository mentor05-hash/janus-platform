import { buildGapReport, type GapInput } from './gap-report';

const jeongsi = (nb: number, cut: number): GapInput => ({ mode: 'jeongsi', gye: '이과', myValue: nb, target: { univ: '서울대', dept: '컴퓨터공학', cut } });
const susi = (g: number, cut: number): GapInput => ({ mode: 'susi', gye: '문과', myValue: g, target: { univ: '서울대', dept: '경영학', cut } });

describe('buildGapReport (janus_report · 정시/수시)', () => {
  it('정시: 목표 누백까지 부족(소신)·shortfall·단위', () => {
    const r = buildGapReport(jeongsi(2.0, 1.5));
    expect(r.mode).toBe('jeongsi');
    expect(r.unit.label).toBe('전국누백');
    expect(r.gap.delta).toBe(0.5);
    expect(r.gap.band).toBe('소신');
    expect(r.gap.message).toContain('0.5 부족');
  });

  it('수시: 내신 등급 격차·단위(등급)', () => {
    const r = buildGapReport(susi(2.3, 1.8));
    expect(r.mode).toBe('susi');
    expect(r.unit.label).toBe('내신 등급');
    expect(r.gap.delta).toBe(0.5);
    expect(r.gap.band).toBe('소신');
    expect(r.gap.message).toContain('등급');
  });

  it('밴드 경계(공통)', () => {
    expect(buildGapReport(jeongsi(1.0, 1.5)).gap.band).toBe('안정');
    expect(buildGapReport(susi(1.7, 1.8)).gap.band).toBe('적정'); // delta -0.1
    expect(buildGapReport(jeongsi(3.0, 1.5)).gap.band).toBe('상향');
  });

  it('C5: 모든 evidence 에 relTier(정시·수시 모두)', () => {
    for (const r of [buildGapReport(jeongsi(1.6, 1.5)), buildGapReport(susi(2.0, 1.8))]) {
      expect(r.evidence.length).toBeGreaterThan(0);
      for (const e of r.evidence) expect(['measured', 'multiyear', 'estimated']).toContain(e.relTier);
    }
  });

  it('합격률 힌트(≈37%)는 정시 컷 근접만, 수시는 항상 null', () => {
    expect(buildGapReport(jeongsi(1.6, 1.5)).gap.admitProbHint).toBe(37);
    expect(buildGapReport(jeongsi(3.0, 1.5)).gap.admitProbHint).toBeNull();
    expect(buildGapReport(susi(1.9, 1.8)).gap.admitProbHint).toBeNull(); // 수시는 힌트 없음
  });

  it('업셀 윤리: 무료 액션 + consult-reserve(양 모드)', () => {
    for (const r of [buildGapReport(jeongsi(2.0, 1.5)), buildGapReport(susi(2.5, 1.8))]) {
      expect(r.prescription.actions.some((a) => a.free)).toBe(true);
      expect(r.prescription.actions.some((a) => a.ctaId === 'consult-reserve')).toBe(true);
    }
  });
});
