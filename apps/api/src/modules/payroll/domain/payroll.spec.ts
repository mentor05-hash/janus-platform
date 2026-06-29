import { computePayroll } from './payroll';

const RATES = { perCaseRate: 30_000, qnaRate: 5_000, gradeAllowance: 100_000 };

describe('예상급여 산정(§payroll)', () => {
  it('확정분 = 완료건×단가 + Q&A채택×Q&A단가 + 등급수당', () => {
    const r = computePayroll({ doneCount: 2, upcomingCount: 0, qnaAcceptedCount: 1 }, RATES);
    expect(r.confirmedAmount).toBe(2 * 30_000 + 1 * 5_000 + 100_000); // 165,000
  });

  it('예상분 = 확정분 + 예정건×단가', () => {
    const r = computePayroll({ doneCount: 2, upcomingCount: 3, qnaAcceptedCount: 0 }, RATES);
    expect(r.confirmedAmount).toBe(2 * 30_000 + 100_000); // 160,000
    expect(r.expectedAmount).toBe(160_000 + 3 * 30_000); // 250,000
  });

  it('활동 없으면 확정분은 등급수당만', () => {
    const r = computePayroll({ doneCount: 0, upcomingCount: 0, qnaAcceptedCount: 0 }, RATES);
    expect(r.confirmedAmount).toBe(100_000);
    expect(r.expectedAmount).toBe(100_000);
  });
});
