import { evaluatePenalty } from './penalty';

const T = { cancelThreshold: 3, noshowThreshold: 2, rejectThreshold: 5, rankingWeightDown: 0.3 };

describe('가중 제한(§5-7)', () => {
  it('임계 미만이면 제한 없음', () => {
    const r = evaluatePenalty({ cancelCount: 2, noshowCount: 1, rejectCount: 4 }, T);
    expect(r.restricted).toBe(false);
    expect(r.rankingWeightDown).toBe(0);
  });

  it('노쇼 임계 도달 시 제한 + 랭킹 가중치 하락', () => {
    const r = evaluatePenalty({ cancelCount: 0, noshowCount: 2, rejectCount: 0 }, T);
    expect(r.restricted).toBe(true);
    expect(r.reasons).toContain('noshow');
    expect(r.rankingWeightDown).toBe(0.3);
  });

  it('미설정(null) 임계는 제한에 영향 없음', () => {
    const r = evaluatePenalty(
      { cancelCount: 99, noshowCount: 99, rejectCount: 99 },
      { cancelThreshold: null, noshowThreshold: null, rejectThreshold: null, rankingWeightDown: null },
    );
    expect(r.restricted).toBe(false);
  });
});
