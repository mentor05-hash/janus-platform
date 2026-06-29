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
  const m = from.getUTCMonth() + months;
  const targetY = from.getUTCFullYear() + Math.floor(m / 12);
  const targetM = ((m % 12) + 12) % 12;
  // 말일 클램프: 1/31 + 1개월 → 2/28(2/31 오버플로 방지)
  const lastDay = new Date(Date.UTC(targetY, targetM + 1, 0)).getUTCDate();
  const day = Math.min(from.getUTCDate(), lastDay);
  return new Date(Date.UTC(targetY, targetM, day));
}
