import { canLinkTransition } from './guardian-link';

/** 보호자 연결 승인 상태머신. */
describe('보호자 연결 상태머신', () => {
  it('정상 전이: pending→approved/rejected, approved→revoked', () => {
    expect(canLinkTransition('pending', 'approved')).toBe(true);
    expect(canLinkTransition('pending', 'rejected')).toBe(true);
    expect(canLinkTransition('approved', 'revoked')).toBe(true);
  });

  it('잘못된 전이 차단', () => {
    expect(canLinkTransition('rejected', 'approved')).toBe(false);
    expect(canLinkTransition('revoked', 'approved')).toBe(false);
    expect(canLinkTransition('pending', 'revoked')).toBe(false); // 승인 전 해제 불가
    expect(canLinkTransition('approved', 'pending')).toBe(false);
  });
});
