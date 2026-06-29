import { canProposeReverse } from './reverse';

describe('역상담 첫 상담 한정(§5-4)', () => {
  it('기존 성사 상담 없으면 제안 가능', () => {
    expect(canProposeReverse(0)).toBe(true);
  });
  it('이미 성사된 상담이 있으면 제안 불가', () => {
    expect(canProposeReverse(1)).toBe(false);
    expect(canProposeReverse(5)).toBe(false);
  });
});
