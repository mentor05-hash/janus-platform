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

/** 자동 인센티브 정책(payroll_policy.auto_incentive). */
export interface IncentivePolicy {
  on: boolean;
  minCases?: number; // 최소 완료 상담 수
  minRating?: number; // 최소 평점
  amount: number;
}

/** 조건 충족 시 인센티브 금액, 아니면 0. */
export function computeIncentive(
  stats: { doneCount: number; rating?: number },
  policy?: IncentivePolicy | null,
): number {
  if (!policy || !policy.on) return 0;
  if (policy.minCases != null && stats.doneCount < policy.minCases) return 0;
  if (policy.minRating != null && (stats.rating ?? 0) < policy.minRating) return 0;
  return policy.amount ?? 0;
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
