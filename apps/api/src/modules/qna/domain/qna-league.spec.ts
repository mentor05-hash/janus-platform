import { evaluateLeague, nextTierNeed, DEFAULT_LEAGUE_POLICY } from './qna-league';

describe('Q3 리그 판정', () => {
  it('기본은 3부', () => {
    expect(evaluateLeague({ authored: 0, accepted: 0, acceptRate: 0 })).toBe(3);
    expect(evaluateLeague({ authored: 4, accepted: 2, acceptRate: 50 })).toBe(3); // 답변 부족
  });

  it('2부 요건(답변5·채택3·률50)', () => {
    expect(evaluateLeague({ authored: 5, accepted: 3, acceptRate: 50 })).toBe(2);
    expect(evaluateLeague({ authored: 6, accepted: 3, acceptRate: 49 })).toBe(3); // 률 미달
  });

  it('1부 요건(답변15·채택10·률70)', () => {
    expect(evaluateLeague({ authored: 15, accepted: 10, acceptRate: 70 })).toBe(1);
    expect(evaluateLeague({ authored: 20, accepted: 9, acceptRate: 90 })).toBe(2); // 채택 미달 → 2부
  });

  it('정책 override 반영', () => {
    const strict = { promote2: { minAuthored: 100, minAccepted: 100, minRate: 100 }, promote1: { minAuthored: 200, minAccepted: 200, minRate: 100 } };
    expect(evaluateLeague({ authored: 50, accepted: 50, acceptRate: 100 }, strict)).toBe(3);
  });

  it('다음 등급 요건', () => {
    expect(nextTierNeed(3)?.tier).toBe(2);
    expect(nextTierNeed(2)).toEqual({ tier: 1, rule: DEFAULT_LEAGUE_POLICY.promote1 });
    expect(nextTierNeed(1)).toBeNull();
  });
});
