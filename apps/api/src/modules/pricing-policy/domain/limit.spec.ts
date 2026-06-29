import { canAddWithinLimit } from './limit';

describe('한도 동결 규칙(§5-9)', () => {
  it('무제한(null)은 항상 추가 가능', () => {
    expect(canAddWithinLimit(100, null)).toBe(true);
  });
  it('한도 미만이면 추가 가능, 도달 시 차단', () => {
    expect(canAddWithinLimit(9, 10)).toBe(true);
    expect(canAddWithinLimit(10, 10)).toBe(false);
  });
  it('한도 축소 시 기존 동결·신규만 차단(보유 8 > 새 한도 5 → 추가 불가, 기존 유지)', () => {
    expect(canAddWithinLimit(8, 5)).toBe(false);
  });
});
