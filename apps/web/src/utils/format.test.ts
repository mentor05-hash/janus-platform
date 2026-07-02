import { describe, it, expect } from 'vitest';
import { won, credits } from './format';

describe('won — 금액 표시', () => {
  it('천단위 콤마 + 원', () => {
    expect(won(0)).toBe('0원');
    expect(won(1234567)).toBe('1,234,567원');
  });
  it('소수는 반올림', () => {
    expect(won(2500.4)).toBe('2,500원');
    expect(won(2500.6)).toBe('2,501원');
  });
});

describe('credits — 크레딧 표시', () => {
  it('천단위 콤마(단위 없음)', () => {
    expect(credits(51603)).toBe('51,603');
    expect(credits(0)).toBe('0');
  });
});
