import { computeDeductions } from './deductions';

describe('computeDeductions (급여 공제)', () => {
  it('0원은 공제·실지급 모두 0', () => {
    const d = computeDeductions(0);
    expect(d.total).toBe(0);
    expect(d.net).toBe(0);
  });

  it('실지급 = 총액 − 공제합계 (항목 합과 total 일치)', () => {
    const d = computeDeductions(3_000_000);
    const sum =
      d.국민연금 +
      d.건강보험 +
      d.장기요양 +
      d.고용보험 +
      d.소득세 +
      d.지방소득세;
    expect(d.total).toBe(sum);
    expect(d.net).toBe(3_000_000 - d.total);
  });

  it('4대보험 근로자 요율 근사(국민연금 4.5%·고용 0.9%)', () => {
    const d = computeDeductions(2_000_000);
    expect(d.국민연금).toBeCloseTo(90_000, -2); // 4.5%
    expect(d.고용보험).toBeCloseTo(18_000, -2); // 0.9%
    expect(d.장기요양).toBeGreaterThan(0); // 건강보험료 기반
  });

  it('지방소득세 = 소득세의 10%(반올림 오차 허용)', () => {
    const d = computeDeductions(4_000_000);
    expect(
      Math.abs(d.지방소득세 - Math.round(d.소득세 * 0.1)),
    ).toBeLessThanOrEqual(10);
  });

  it('총액이 클수록 공제·실지급 단조 증가', () => {
    const a = computeDeductions(2_000_000);
    const b = computeDeductions(4_000_000);
    expect(b.total).toBeGreaterThan(a.total);
    expect(b.net).toBeGreaterThan(a.net);
  });
});
