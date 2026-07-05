import {
  canTransition,
  defaultAssignmentMode,
  packagePriceWon,
  canAccessDocuments,
} from './status';

describe('컨설팅 신청 상태머신(설계안 §3)', () => {
  it('정상 전이: submitted→awaiting_payment→paid→in_review→completed', () => {
    expect(canTransition('submitted', 'awaiting_payment')).toBe(true);
    expect(canTransition('awaiting_payment', 'paid')).toBe(true);
    expect(canTransition('paid', 'in_review')).toBe(true);
    expect(canTransition('in_review', 'completed')).toBe(true);
  });

  it('잘못된 전이 차단: submitted→paid, completed→*', () => {
    expect(canTransition('submitted', 'paid')).toBe(false);
    expect(canTransition('submitted', 'completed')).toBe(false);
    expect(canTransition('completed', 'in_review')).toBe(false);
    expect(canTransition('canceled', 'submitted')).toBe(false);
  });

  it('대부분 상태에서 취소 가능(완료/취소 제외)', () => {
    expect(canTransition('submitted', 'canceled')).toBe(true);
    expect(canTransition('awaiting_payment', 'canceled')).toBe(true);
    expect(canTransition('paid', 'canceled')).toBe(true);
    expect(canTransition('completed', 'canceled')).toBe(false);
  });
});

describe('상품별 배정 방식(수동/신청 시 지정)', () => {
  it('시즌 정기권은 신청 시 자동 지정', () => {
    expect(defaultAssignmentMode('season')).toBe('at_application');
  });
  it('단건·종합은 수동 배정', () => {
    expect(defaultAssignmentMode('single')).toBe('manual');
    expect(defaultAssignmentMode('full')).toBe('manual');
  });
});

describe('상품 가격(원화 · 크레딧 불가)', () => {
  it('단건 15만 / 시즌 48만 / 종합 맞춤견적(null)', () => {
    expect(packagePriceWon('single')).toBe(150000);
    expect(packagePriceWon('season')).toBe(480000);
    expect(packagePriceWon('full')).toBeNull();
  });
});

describe('열람 게이트(결제 완료 후)', () => {
  it('paid 일 때만 자료 접근 허용', () => {
    expect(canAccessDocuments('paid')).toBe(true);
    expect(canAccessDocuments('pending')).toBe(false);
    expect(canAccessDocuments(null)).toBe(false);
    expect(canAccessDocuments(undefined)).toBe(false);
  });
});
