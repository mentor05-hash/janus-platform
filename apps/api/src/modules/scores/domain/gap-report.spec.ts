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

describe('회차 변동성 판정(O108) — 한 점으로 단정하지 않기', () => {
  const withRecent = (nb: number, cut: number, recent: number[]): GapInput => ({ ...jeongsi(nb, cut), recent });

  it('recent 없으면 volatility=null (기존 페이로드·소비자 호환)', () => {
    expect(buildGapReport(jeongsi(2.0, 1.5)).volatility).toBeNull();
  });

  it('1회뿐이면 null — 변동을 말할 근거가 없다', () => {
    expect(buildGapReport(withRecent(2.0, 1.5, [2.0])).volatility).toBeNull();
  });

  it('밴드가 뒤집히면 consistent=false 와 구간을 알려준다', () => {
    // 컷 1.5 · 회차 0.9(delta -0.6 → 안정)~2.4(delta +0.9 → 상향) → 회차에 따라 판정이 갈린다
    const v = buildGapReport(withRecent(2.4, 1.5, [0.9, 2.4]))!.volatility!;
    expect(v.count).toBe(2);
    expect(v.best).toBe(0.9);
    expect(v.worst).toBe(2.4);
    expect(v.spread).toBe(1.5);
    expect(v.bestBand).toBe('안정'); // -0.5 이하만 안정 — 경계 확인
    expect(v.worstBand).toBe('상향');
    expect(v.consistent).toBe(false);
    expect(v.message).toContain('갈립니다');
  });

  it('변동이 있어도 같은 구간이면 consistent=true', () => {
    // 컷 1.5 · 회차 2.1~2.4 → 둘 다 상향
    const v = buildGapReport(withRecent(2.4, 1.5, [2.1, 2.4]))!.volatility!;
    expect(v.bestBand).toBe('상향');
    expect(v.worstBand).toBe('상향');
    expect(v.consistent).toBe(true);
    expect(v.message).toContain('어느 회차로 봐도');
  });

  it('3회 미만이면 smallSample=true (해석 주의)', () => {
    expect(buildGapReport(withRecent(2.0, 1.5, [1.8, 2.0]))!.volatility!.smallSample).toBe(true);
    expect(buildGapReport(withRecent(2.0, 1.5, [1.8, 1.9, 2.0]))!.volatility!.smallSample).toBe(false);
  });

  it('점 판정(gap.band)은 최신 회차 기준으로 그대로 유지된다(정본 계약 불변)', () => {
    const r = buildGapReport(withRecent(2.4, 1.5, [0.9, 2.4]));
    expect(r.gap.band).toBe('상향'); // myValue=2.4 기준
    expect(r.gap.delta).toBe(0.9);
  });

  it('수시(등급)도 같은 방향으로 동작한다 — 낮을수록 상위', () => {
    const v = buildGapReport({ ...susi(2.3, 1.8), recent: [1.7, 2.3] })!.volatility!;
    expect(v.best).toBe(1.7);
    expect(v.bestBand).toBe('적정');
    expect(v.message).toContain('등급');
  });

  it('σ·신뢰구간 같은 정밀 수치를 만들지 않는다(표본 과소 — C5 과대표기 방지)', () => {
    const v = buildGapReport(withRecent(2.0, 1.5, [1.8, 2.0]))!.volatility!;
    expect(Object.keys(v).sort()).toEqual(
      ['best', 'bestBand', 'consistent', 'count', 'message', 'smallSample', 'spread', 'worst', 'worstBand'].sort(),
    );
  });
});
