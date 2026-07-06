import { canTransition } from './status';

describe('강의 상태머신', () => {
  it('정상 전이: scheduled→live→ended', () => {
    expect(canTransition('scheduled', 'live')).toBe(true);
    expect(canTransition('live', 'ended')).toBe(true);
  });
  it('취소는 scheduled 에서만', () => {
    expect(canTransition('scheduled', 'canceled')).toBe(true);
    expect(canTransition('live', 'canceled')).toBe(false);
  });
  it('잘못된 전이 차단', () => {
    expect(canTransition('scheduled', 'ended')).toBe(false);
    expect(canTransition('ended', 'live')).toBe(false);
    expect(canTransition('live', 'scheduled')).toBe(false);
  });
});
