import { BillingCycle } from '../../../config/enums';

/**
 * 구독 결제 주기 → 다음 결제일 (CLAUDE.md §membership).
 * monthly +1개월 / quarterly +3개월 / yearly +12개월 (UTC 기준).
 */
const CYCLE_MONTHS: Record<BillingCycle, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

export function computeNextBilling(cycle: BillingCycle, from: Date): Date {
  const months = CYCLE_MONTHS[cycle];
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, from.getUTCDate()));
}
