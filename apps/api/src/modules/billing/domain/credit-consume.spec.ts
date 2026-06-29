import { consumeCredits, GrantLot } from './credit-consume';

/**
 * §5-3 크레딧 소비 순서 불변규칙.
 * 주간 부여분(만료 임박) → 구매분. 부족 시 shortfall.
 */
describe('크레딧 소비 순서(§5-3)', () => {
  it('부여분(만료 임박) 먼저 소진 후 구매분 — granted 10,000 + purchased 50,000, 30,000 소비', () => {
    const grants: GrantLot[] = [{ id: 'g1', remaining: 10_000, expireAt: 100 }];
    const r = consumeCredits(grants, 50_000, 30_000);
    expect(r.grantSpend).toEqual([{ id: 'g1', used: 10_000 }]); // 부여분 전액 우선
    expect(r.purchasedSpend).toBe(20_000); // 나머지는 구매분
    expect(r.shortfall).toBe(0);
  });

  it('여러 부여분은 만료 임박(expireAt 오름차순) 순으로 차감', () => {
    const grants: GrantLot[] = [
      { id: 'late', remaining: 5_000, expireAt: 300 },
      { id: 'soon', remaining: 5_000, expireAt: 100 },
      { id: 'mid', remaining: 5_000, expireAt: 200 },
    ];
    const r = consumeCredits(grants, 0, 12_000);
    expect(r.grantSpend).toEqual([
      { id: 'soon', used: 5_000 },
      { id: 'mid', used: 5_000 },
      { id: 'late', used: 2_000 },
    ]);
    expect(r.purchasedSpend).toBe(0);
    expect(r.shortfall).toBe(0);
  });

  it('잔액 부족 시 shortfall 로 부족분 보고(결제요청 유도)', () => {
    const r = consumeCredits([{ id: 'g1', remaining: 5_000, expireAt: 100 }], 3_000, 20_000);
    expect(r.grantSpend).toEqual([{ id: 'g1', used: 5_000 }]);
    expect(r.purchasedSpend).toBe(3_000);
    expect(r.shortfall).toBe(12_000);
  });
});
