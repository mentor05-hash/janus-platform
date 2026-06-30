import { planRefund } from './credit-refund';

const NOW = 1000;

describe('환원 분배(M4)', () => {
  it('분배 기록 없으면 전액 구매분', () => {
    const r = planRefund(null, {}, NOW, 20000);
    expect(r).toEqual({ grantRestores: [], toPurchased: 20000 });
  });

  it('살아있는 부여분은 lot 복원, 구매분은 구매분으로', () => {
    const split = {
      grantSpend: [{ id: 'g1', used: 5000 }],
      purchasedSpend: 15000,
    };
    const r = planRefund(split, { g1: 2000 }, NOW, 20000); // g1 만료 2000 > now 1000 → 살아있음
    expect(r.grantRestores).toEqual(
      [{ id: 'g1', used: 5000 }].map((x) => ({ id: x.id, amount: x.used })),
    );
    expect(r.toPurchased).toBe(15000);
  });

  it('만료된 부여분은 구매분으로 환원(되살리지 않음)', () => {
    const split = {
      grantSpend: [{ id: 'g1', used: 5000 }],
      purchasedSpend: 15000,
    };
    const r = planRefund(split, { g1: 500 }, NOW, 20000); // g1 만료 500 <= now → 만료
    expect(r.grantRestores).toEqual([]);
    expect(r.toPurchased).toBe(20000);
  });
});
