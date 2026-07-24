import { describe, expect, it } from 'vitest';
import { esc } from './PayrollPage';

// 급여명세서 인쇄창(document.write)에 서버 문자열이 그대로 들어가므로 XSS 이스케이프 검증.
describe('printPayslip esc — HTML 이스케이프', () => {
  it('스크립트/태그 문자를 엔티티로 치환한다', () => {
    expect(esc('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(esc('a & b "c" \'d\'')).toBe('a &amp; b &quot;c&quot; &#39;d&#39;');
  });
  it('악의적 이름이 태그로 닫히지 않는다(속성 이탈 방지)', () => {
    const out = esc('홍길동"><img src=x onerror=alert(1)>');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('">');
    expect(out).toContain('&lt;img');
  });
  it('null/undefined 는 빈 문자열', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
  it('일반 한글·숫자는 그대로 통과', () => {
    expect(esc('강남센터 2026-06')).toBe('강남센터 2026-06');
  });
});
