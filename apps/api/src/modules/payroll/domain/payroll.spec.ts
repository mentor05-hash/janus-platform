import { computeIncentive, computePayroll } from './payroll';

const RATES = {
  perCaseRate: 30_000,
  qnaRate: 5_000,
  gradeAllowance: 100_000,
  hourlyRate: 0,
  staleAnswerBonus: 0,
};
const IN = { workMinutes: 0, staleAnswerCount: 0 };

describe('예상급여 산정(§payroll)', () => {
  it('확정분 = 완료건×단가 + Q&A채택×Q&A단가 + 등급수당', () => {
    const r = computePayroll(
      { doneCount: 2, upcomingCount: 0, qnaAcceptedCount: 1, ...IN },
      RATES,
    );
    expect(r.confirmedAmount).toBe(2 * 30_000 + 1 * 5_000 + 100_000); // 165,000
  });

  it('예상분 = 확정분 + 예정건×단가', () => {
    const r = computePayroll(
      { doneCount: 2, upcomingCount: 3, qnaAcceptedCount: 0, ...IN },
      RATES,
    );
    expect(r.confirmedAmount).toBe(2 * 30_000 + 100_000); // 160,000
    expect(r.expectedAmount).toBe(160_000 + 3 * 30_000); // 250,000
  });

  it('활동 없으면 확정분은 등급수당만', () => {
    const r = computePayroll(
      { doneCount: 0, upcomingCount: 0, qnaAcceptedCount: 0, ...IN },
      RATES,
    );
    expect(r.confirmedAmount).toBe(100_000);
    expect(r.expectedAmount).toBe(100_000);
  });

  it('근무시간×시급 + 48h 미답 보상이 확정분에 합산', () => {
    const r = computePayroll(
      {
        doneCount: 0,
        upcomingCount: 0,
        qnaAcceptedCount: 0,
        workMinutes: 120,
        staleAnswerCount: 2,
      },
      { ...RATES, hourlyRate: 12_000, staleAnswerBonus: 8_000 },
    );
    expect(r.confirmedAmount).toBe(100_000 + 24_000 + 16_000); // 등급수당 + 2h×12000 + 2×8000
  });
});

describe('자동 인센티브(§3.4)', () => {
  it('미설정/off 면 0', () => {
    expect(computeIncentive({ doneCount: 99 }, null)).toBe(0);
    expect(
      computeIncentive({ doneCount: 99 }, { on: false, amount: 50_000 }),
    ).toBe(0);
  });
  it('조건 충족 시 지급', () => {
    expect(
      computeIncentive(
        { doneCount: 5, rating: 4.5 },
        { on: true, minCases: 3, minRating: 4.0, amount: 50_000 },
      ),
    ).toBe(50_000);
  });
  it('조건 미달 시 0', () => {
    expect(
      computeIncentive(
        { doneCount: 2, rating: 4.5 },
        { on: true, minCases: 3, amount: 50_000 },
      ),
    ).toBe(0);
    expect(
      computeIncentive(
        { doneCount: 5, rating: 3.0 },
        { on: true, minRating: 4.0, amount: 50_000 },
      ),
    ).toBe(0);
  });
});
