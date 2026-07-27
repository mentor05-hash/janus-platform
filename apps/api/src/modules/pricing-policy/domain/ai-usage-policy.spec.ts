import {
  AI_USAGE_DEFAULT,
  AI_USAGE_GUARD,
  capacityMessage,
  discretionaryTotalLimit,
  reconcileCapacity,
  resolveAiUsage,
} from './ai-usage-policy';
import {
  GRADE_BENEFITS_DEFAULT,
  GRADE_BENEFITS_GUARD,
  GradeBenefit,
} from './grade-benefits';
import { LLM_DEFAULT_LIMITS } from '../../llm/llm.limits';

const bench = (aiReportsPerMonth: number): GradeBenefit => ({
  ...GRADE_BENEFITS_DEFAULT[4],
  aiReportsPerMonth,
});

describe('AI 사용량 3층 정책(B221)', () => {
  describe('2층 — 예약분 분리', () => {
    it('재량 용도의 상한은 예약분만큼 낮다', () => {
      expect(discretionaryTotalLimit(400, 0.4)).toBe(240);
      expect(discretionaryTotalLimit(400, 0)).toBe(400); // 예약 없음 = 기존 동작
    });

    it('예약 비율은 안전선까지만 반영된다 — 재량 용도가 0 이 되지 않게', () => {
      const over = discretionaryTotalLimit(400, 5); // 말도 안 되는 값
      expect(over).toBe(Math.floor(400 * (1 - AI_USAGE_GUARD.maxReservePct)));
      expect(over).toBeGreaterThan(0);
    });

    it('상한 0 이하(무제한 의도)는 그대로 통과시킨다', () => {
      expect(discretionaryTotalLimit(0, 0.4)).toBe(0);
    });
  });

  describe('3층 — 정합 불변식(판 권리 ≤ 감당 가능량)', () => {
    const purposeDailyLimit = LLM_DEFAULT_LIMITS.consulting; // 60

    it('회원이 0명이면 언제나 통과 — 초기에 헛제약을 걸지 않는다', () => {
      const c = reconcileCapacity({
        benefits: GRADE_BENEFITS_DEFAULT,
        usersByTier: {},
        purposeDailyLimit,
        peakFactor: 3,
      });
      expect(c.requiredPerDay).toBe(0);
      expect(c.ok).toBe(true);
    });

    // B218 설계서가 발견한 그 경계를 그대로 고정한다.
    it('VIP 100명 × 월 6건은 감당 가능하다(기본값)', () => {
      const c = reconcileCapacity({
        benefits: GRADE_BENEFITS_DEFAULT,
        usersByTier: { 4: 100 },
        purposeDailyLimit,
        peakFactor: 1, // 피크 없이 균등 분포
      });
      expect(c.requiredPerDay).toBe(20);
      expect(c.ok).toBe(true);
    });

    it('안전선(월 20건) × 100명은 감당할 수 없다 — 이게 B221 의 원래 모순', () => {
      const c = reconcileCapacity({
        benefits: { 4: bench(GRADE_BENEFITS_GUARD.maxAiReportsPerMonth) },
        usersByTier: { 4: 100 },
        purposeDailyLimit,
        peakFactor: 1,
      });
      expect(c.requiredPerDay).toBe(67); // ceil(100×20/30)
      expect(c.ok).toBe(false);
    });

    it('피크 계수가 필요량을 배로 키운다 — 몰리는 시기를 감당해야 하므로', () => {
      const flat = reconcileCapacity({
        benefits: GRADE_BENEFITS_DEFAULT,
        usersByTier: { 4: 100 },
        purposeDailyLimit,
        peakFactor: 1,
      });
      const peak = reconcileCapacity({
        benefits: GRADE_BENEFITS_DEFAULT,
        usersByTier: { 4: 100 },
        purposeDailyLimit,
        peakFactor: AI_USAGE_DEFAULT.peakFactor,
      });
      expect(peak.requiredPerDay).toBe(flat.requiredPerDay * 3);
      // 필요 60 = 상한 60. 여유분이 없으면 "딱 맞는다"고 통과시켰겠지만,
      // 그 상태의 마지막 요청은 반드시 거절된다 — 판 권리를 못 지킨다.
      expect(peak.requiredPerDay).toBe(peak.availablePerDay);
      expect(peak.ok).toBe(false);
    });

    it('상한을 100% 소진하는 계획은 통과시키지 않는다 — 여유분이 판정 기준', () => {
      const c = reconcileCapacity({
        benefits: GRADE_BENEFITS_DEFAULT,
        usersByTier: { 4: 100 },
        purposeDailyLimit,
        peakFactor: AI_USAGE_DEFAULT.peakFactor,
      });
      expect(c.availablePerDay).toBe(60);
      expect(c.usablePerDay).toBe(
        Math.floor(60 * (1 - AI_USAGE_GUARD.capacityHeadroomPct)),
      );
      expect(c.usablePerDay).toBeLessThan(c.availablePerDay);
      expect(c.ok).toBe(c.requiredPerDay <= c.usablePerDay);
    });

    it('피크 계수 1 미만은 1 로 올려 본다 — 과소평가를 막는다', () => {
      const c = reconcileCapacity({
        benefits: GRADE_BENEFITS_DEFAULT,
        usersByTier: { 4: 100 },
        purposeDailyLimit,
        peakFactor: 0,
      });
      expect(c.requiredPerDay).toBe(20);
    });

    it('용도 상한 0 이하(무제한)면 언제나 감당 가능', () => {
      const c = reconcileCapacity({
        benefits: { 4: bench(1000) },
        usersByTier: { 4: 1000 },
        purposeDailyLimit: 0,
        peakFactor: 3,
      });
      expect(c.ok).toBe(true);
      expect(c.availablePerDay).toBe(Number.POSITIVE_INFINITY);
      // 무제한에는 여유분을 뺄 대상이 없다 — 곱하면 NaN 이 되므로 그대로 둔다.
      expect(c.usablePerDay).toBe(Number.POSITIVE_INFINITY);
    });

    it('등급별 기여를 분해해 알려 준다 — 어디를 줄여야 하는지 보이게', () => {
      const c = reconcileCapacity({
        benefits: { 3: bench(3), 4: bench(6) },
        usersByTier: { 3: 10, 4: 50 },
        purposeDailyLimit,
        peakFactor: 1,
      });
      const t4 = c.byTier.find((x) => x.tier === 4)!;
      const t3 = c.byTier.find((x) => x.tier === 3)!;
      expect(t4.perMonth).toBe(300);
      expect(t3.perMonth).toBe(30);
      expect(t4.perDay).toBeGreaterThan(t3.perDay);
    });

    it('위반 메시지에 필요량·상한·최대 기여 등급·행동이 담긴다', () => {
      const c = reconcileCapacity({
        benefits: { 4: bench(20) },
        usersByTier: { 4: 100 },
        purposeDailyLimit,
        peakFactor: 1,
      });
      const msg = capacityMessage(c, 'consulting');
      expect(msg).toContain('67'); // 필요량
      expect(msg).toContain('48'); // 가용(= 판정 기준)
      expect(msg).toContain('60'); // 상한(어디까지 올릴 수 있는지 보이게)
      expect(msg).toContain('등급 4');
      expect(msg).toContain('LLM_DAILY_LIMIT_CONSULTING');
    });
  });

  describe('정책값 해석', () => {
    it('저장값이 없으면 기본값', () => {
      expect(resolveAiUsage(null)).toEqual(AI_USAGE_DEFAULT);
    });

    it('부분 저장값은 기본값으로 메꾼다', () => {
      const r = resolveAiUsage({ peakFactor: 5 });
      expect(r.peakFactor).toBe(5);
      expect(r.reportReviewPerUserDay).toBe(
        AI_USAGE_DEFAULT.reportReviewPerUserDay,
      );
    });
  });
});
