import {
  minMaxNormalize,
  pct,
  resolvePeriod,
  weightedScore,
  weightsSumTo100,
  zScoreTo0100,
} from './metrics';

describe('dashboard metrics (순수)', () => {
  it('가중치 합계 100 검증', () => {
    expect(
      weightsSumTo100({
        w_total: 20,
        w_completion: 20,
        w_rerequest: 15,
        w_reject: 10,
        w_noshow: 10,
        w_response: 10,
        w_satisfaction: 15,
      }),
    ).toBe(true);
    expect(
      weightsSumTo100({
        w_total: 20,
        w_completion: 20,
        w_rerequest: 15,
        w_reject: 10,
        w_noshow: 10,
        w_response: 10,
        w_satisfaction: 16,
      }),
    ).toBe(false);
  });

  it('min-max 정규화: 최저=0, 최고=100, 동일표본=50', () => {
    expect(minMaxNormalize([10, 20, 30])).toEqual([0, 50, 100]);
    expect(minMaxNormalize([5, 5, 5])).toEqual([50, 50, 50]);
  });

  it('역지표 반전: 작을수록 100', () => {
    expect(minMaxNormalize([10, 20, 30], true)).toEqual([100, 50, 0]);
  });

  it('z-score 0~100: 평균은 50 근처, 분산0=전부 50', () => {
    expect(zScoreTo0100([7, 7, 7])).toEqual([50, 50, 50]);
    const z = zScoreTo0100([0, 50, 100]);
    expect(z[1]).toBe(50); // 평균 위치
    expect(z[0]).toBeLessThan(50);
    expect(z[2]).toBeGreaterThan(50);
  });

  it('가중 종합점수: 모든 지표 100·가중치 정상 → 100', () => {
    const norm = {
      total: 100,
      completion: 100,
      rerequest: 100,
      reject: 100,
      noshow: 100,
      response: 100,
      satisfaction: 100,
    };
    const w = {
      w_total: 20,
      w_completion: 20,
      w_rerequest: 15,
      w_reject: 10,
      w_noshow: 10,
      w_response: 10,
      w_satisfaction: 15,
    };
    expect(weightedScore(norm, w)).toBe(100);
  });

  it('pct: 0 분모 안전', () => {
    expect(pct(3, 0)).toBe(0);
    expect(pct(1, 4)).toBe(25);
  });

  it('resolvePeriod: 1w 는 7일 전, all 은 undefined', () => {
    const now = new Date('2026-06-30T00:00:00Z');
    const r = resolvePeriod('1w', undefined, undefined, now);
    expect(r?.gte?.toISOString()).toBe('2026-06-23T00:00:00.000Z');
    expect(resolvePeriod('all', undefined, undefined, now)).toBeUndefined();
  });
});
