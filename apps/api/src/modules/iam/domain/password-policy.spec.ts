import { validatePassword } from './password-policy';

describe('비밀번호 정책(§10)', () => {
  it('정책 충족(영문+숫자, 8자+) → ok', () => {
    expect(validatePassword('mentor2026').ok).toBe(true);
  });

  it('8자 미만 거부', () => {
    const r = validatePassword('a1b2c3');
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('8자 이상');
  });

  it('영문/숫자 누락 거부', () => {
    expect(validatePassword('12345678').ok).toBe(false); // 영문 없음(+흔한 비번)
    expect(validatePassword('abcdefgh').ok).toBe(false); // 숫자 없음
  });

  it('동일문자 반복 거부', () => {
    expect(validatePassword('aaaaaaaa').reasons).toContain(
      '동일문자 반복 불가',
    );
  });

  it('아이디 포함 거부', () => {
    const r = validatePassword('student1234', 'student');
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('아이디 미포함');
  });

  it('흔한 비밀번호 거부', () => {
    expect(validatePassword('password').ok).toBe(false);
  });
});
