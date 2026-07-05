import { resolvePaymentAmount, canViewDocumentContent } from './payment';

describe('결제 금액 산정(원화 · 크레딧 불가)', () => {
  it('고정가 상품은 기본가 사용', () => {
    expect(resolvePaymentAmount('single')).toEqual({ ok: true, amount: 150000 });
    expect(resolvePaymentAmount('season')).toEqual({ ok: true, amount: 480000 });
  });
  it('고정가 상품도 override(할인) 허용', () => {
    expect(resolvePaymentAmount('single', 120000)).toEqual({ ok: true, amount: 120000 });
  });
  it('종합 전담(맞춤 견적)은 금액 지정 필수', () => {
    const r = resolvePaymentAmount('full');
    expect(r.ok).toBe(false);
    expect(resolvePaymentAmount('full', 0).ok).toBe(false);
    expect(resolvePaymentAmount('full', 1200000)).toEqual({ ok: true, amount: 1200000 });
  });
});

describe('자료 열람 게이트(결제 완료 후)', () => {
  it('신청자·스태프는 결제와 무관하게 열람', () => {
    expect(canViewDocumentContent({ isOwner: true, isStaff: false, isAssignedConsultant: false, paymentStatus: 'pending' })).toBe(true);
    expect(canViewDocumentContent({ isOwner: false, isStaff: true, isAssignedConsultant: false, paymentStatus: null })).toBe(true);
  });
  it('배정 컨설턴트는 결제 완료 후에만 열람', () => {
    expect(canViewDocumentContent({ isOwner: false, isStaff: false, isAssignedConsultant: true, paymentStatus: 'paid' })).toBe(true);
    expect(canViewDocumentContent({ isOwner: false, isStaff: false, isAssignedConsultant: true, paymentStatus: 'pending' })).toBe(false);
  });
  it('무관한 사용자는 차단', () => {
    expect(canViewDocumentContent({ isOwner: false, isStaff: false, isAssignedConsultant: false, paymentStatus: 'paid' })).toBe(false);
  });
});
