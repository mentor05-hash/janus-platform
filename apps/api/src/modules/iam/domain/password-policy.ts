/**
 * 비밀번호 정책 (CLAUDE.md §10 보안). 순수 함수 — DTO 검증·서비스 양쪽에서 재사용/테스트.
 * 규칙: 8자 이상 · 영문+숫자 포함 · 동일문자 반복 금지 · 아이디 미포함 · 흔한 비밀번호 금지.
 */
export interface PasswordCheck {
  ok: boolean;
  reasons: string[];
}

const COMMON_WEAK = new Set([
  'password',
  '12345678',
  '123456789',
  'qwerty123',
  '11111111',
  'itall123',
]);

export function validatePassword(pw: string, loginId?: string): PasswordCheck {
  const reasons: string[] = [];
  const v = pw ?? '';
  if (v.length < 8) reasons.push('8자 이상');
  if (!/[A-Za-z]/.test(v)) reasons.push('영문 포함');
  if (!/[0-9]/.test(v)) reasons.push('숫자 포함');
  if (/^(.)\1+$/.test(v)) reasons.push('동일문자 반복 불가');
  if (loginId && v.toLowerCase().includes(loginId.toLowerCase())) reasons.push('아이디 미포함');
  if (COMMON_WEAK.has(v.toLowerCase())) reasons.push('너무 흔한 비밀번호');
  return { ok: reasons.length === 0, reasons };
}
