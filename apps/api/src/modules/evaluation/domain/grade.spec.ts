import { averageRating, computeGrade } from './grade';

describe('평가·등급(§6 Phase 3)', () => {
  it('평균 평점(소수 1자리, null 무시)', () => {
    expect(averageRating([4, 4, 5, 4])).toBe(4.3);
    expect(averageRating([5, null, 4])).toBe(4.5);
    expect(averageRating([])).toBe(0);
  });

  it('등급 컷 S/A/B', () => {
    expect(computeGrade(4.6, 10)).toBe('S');
    expect(computeGrade(4.6, 9)).toBe('A'); // 상담 부족 → S 아님
    expect(computeGrade(4.0, 1)).toBe('A');
    expect(computeGrade(3.9, 100)).toBe('B');
  });
});
