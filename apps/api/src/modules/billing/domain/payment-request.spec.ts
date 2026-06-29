import { AccountRole } from '../../../config/enums';
import { canPayRequest, resolveCreatePath } from './payment-request';

/** 결제요청 3경로. */
describe('결제요청 경로', () => {
  it('역할별 생성 경로', () => {
    expect(resolveCreatePath(AccountRole.STUDENT)).toBe('student_self');
    expect(resolveCreatePath(AccountRole.GUARDIAN)).toBe('guardian_proxy');
    expect(resolveCreatePath(AccountRole.ADMIN)).toBe('admin_issued');
  });

  it('선생님/HR 은 결제요청 생성 불가', () => {
    expect(() => resolveCreatePath(AccountRole.TEACHER)).toThrow();
    expect(() => resolveCreatePath(AccountRole.HR)).toThrow();
  });

  it('결제(대납) 응답은 보호자·학생만', () => {
    expect(canPayRequest(AccountRole.GUARDIAN)).toBe(true);
    expect(canPayRequest(AccountRole.STUDENT)).toBe(true);
    expect(canPayRequest(AccountRole.ADMIN)).toBe(false);
  });
});
