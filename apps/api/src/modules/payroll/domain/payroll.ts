/**
 * 예상급여 산정 (CLAUDE.md §payroll). 확정분 + 예상분.
 * 단가는 정책테이블(payroll_policy) 또는 ENV 기본값(하드코딩 금지, O20).
 */
export interface PayrollInput {
  doneCount: number; // 완료 상담 수(확정)
  upcomingCount: number; // 예정(confirmed) 상담 수(예상)
  qnaAcceptedCount: number; // 채택된 Q&A 수
  workMinutes: number; // 이번 달 예정 근무 분(T5b)
  staleAnswerCount: number; // 48h 초과 미답 → 답변(채택)한 건수(T5c)
}

export interface PayrollRates {
  perCaseRate: number; // 상담 건당
  qnaRate: number; // Q&A 건당
  gradeAllowance: number; // 등급 수당(고정)
  hourlyRate: number; // 근무시간 시급(T5b)
  staleAnswerBonus: number; // 48h 미답 답변 건당 보상(T5c)
  basePay?: number; // 근무자별 고정 월 기본급(기본급 근무자). 선택 — 없으면 0.
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
    basePay: number;
    workMinutes: number;
    workHoursPay: number;
    hourlyRate: number;
    staleAnswerCount: number;
    staleBonus: number;
    staleAnswerBonus: number;
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
  if (policy.minRating != null && (stats.rating ?? 0) < policy.minRating)
    return 0;
  return policy.amount ?? 0;
}

export function computePayroll(
  input: PayrollInput,
  rates: PayrollRates,
): PayrollEstimate {
  const workHoursPay = Math.round((input.workMinutes / 60) * rates.hourlyRate);
  const staleBonus = input.staleAnswerCount * rates.staleAnswerBonus;
  const basePay = rates.basePay ?? 0; // 기본급(고정)
  const confirmedAmount =
    input.doneCount * rates.perCaseRate +
    input.qnaAcceptedCount * rates.qnaRate +
    rates.gradeAllowance +
    basePay +
    workHoursPay +
    staleBonus;
  // 예상분 = 확정분 + 예정 상담의 건당 추정
  const expectedAmount =
    confirmedAmount + input.upcomingCount * rates.perCaseRate;
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
      basePay,
      workMinutes: input.workMinutes,
      workHoursPay,
      hourlyRate: rates.hourlyRate,
      staleAnswerCount: input.staleAnswerCount,
      staleBonus,
      staleAnswerBonus: rates.staleAnswerBonus,
    },
  };
}
