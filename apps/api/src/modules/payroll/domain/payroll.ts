/**
 * 예상급여 산정 (CLAUDE.md §payroll). 확정분 + 예상분.
 * 단가는 정책테이블(payroll_policy) 또는 ENV 기본값(하드코딩 금지, O20).
 */
export interface PayrollInput {
  doneCount: number; // 완료 상담 수(확정)
  upcomingCount: number; // 예정(confirmed) 상담 수(예상)
  qnaAcceptedCount: number; // 채택된 Q&A 수
}

export interface PayrollRates {
  perCaseRate: number; // 상담 건당
  qnaRate: number; // Q&A 건당
  gradeAllowance: number; // 등급 수당(고정)
}

export interface PayrollEstimate {
  confirmedAmount: number;
  expectedAmount: number;
  breakdown: {
    doneCases: number;
    upcomingCases: number;
    qnaAccepted: number;
    perCaseRate: number;
    qnaRate: number;
    gradeAllowance: number;
  };
}

export function computePayroll(input: PayrollInput, rates: PayrollRates): PayrollEstimate {
  const confirmedAmount =
    input.doneCount * rates.perCaseRate +
    input.qnaAcceptedCount * rates.qnaRate +
    rates.gradeAllowance;
  // 예상분 = 확정분 + 예정 상담의 건당 추정
  const expectedAmount = confirmedAmount + input.upcomingCount * rates.perCaseRate;
  return {
    confirmedAmount,
    expectedAmount,
    breakdown: {
      doneCases: input.doneCount,
      upcomingCases: input.upcomingCount,
      qnaAccepted: input.qnaAcceptedCount,
      perCaseRate: rates.perCaseRate,
      qnaRate: rates.qnaRate,
      gradeAllowance: rates.gradeAllowance,
    },
  };
}
