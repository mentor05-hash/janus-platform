import { computeSessionCost, PRICING_DEFAULTS } from '../../../config/constants';

/**
 * §5-2 요금 단일 소스 불변규칙.
 * cost = round(perHour × min ÷ 60), S급은 할증(+20%) 후 계산.
 * 시드값: 줌 per_hour=40,000 → 30분 일반=20,000 / S급=24,000.
 */
describe('요금 계산(§5-2)', () => {
  const zoomPerHour = PRICING_DEFAULTS.perHour.zoom; // 40,000
  const sPct = PRICING_DEFAULTS.sGradeSurchargePct; // 20

  it('줌 30분 일반 = 20,000', () => {
    expect(computeSessionCost(zoomPerHour, 30, 0)).toBe(20_000);
  });

  it('줌 30분 S급(+20%) = 24,000', () => {
    expect(computeSessionCost(zoomPerHour, 30, sPct)).toBe(24_000);
  });

  it('round 규칙: 15분 일반 = round(40000×15÷60)=10,000', () => {
    expect(computeSessionCost(zoomPerHour, 15, 0)).toBe(10_000);
  });

  it('게시판 건당: 문항(8,000) ≥ 일반(4,000) (DB CHECK 정합)', () => {
    expect(PRICING_DEFAULTS.boardItemFee).toBeGreaterThanOrEqual(PRICING_DEFAULTS.boardGeneralFee);
  });
});
