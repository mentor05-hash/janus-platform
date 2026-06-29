import { computeNextBilling } from './billing-cycle';

/** 구독 결제 주기 다음 결제일. */
describe('구독 결제 주기', () => {
  const base = new Date(Date.UTC(2026, 0, 15)); // 2026-01-15

  it('monthly +1개월', () => {
    expect(computeNextBilling('monthly', base).toISOString().slice(0, 10)).toBe('2026-02-15');
  });
  it('quarterly +3개월', () => {
    expect(computeNextBilling('quarterly', base).toISOString().slice(0, 10)).toBe('2026-04-15');
  });
  it('yearly +12개월', () => {
    expect(computeNextBilling('yearly', base).toISOString().slice(0, 10)).toBe('2027-01-15');
  });
});
