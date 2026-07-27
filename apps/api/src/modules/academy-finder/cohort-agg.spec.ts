import {
  gradeToBand,
  toBandPercent,
  kAnonSchoolDist,
  VERIFIED_MIN_N,
} from './cohort-agg';

describe('cohort aggregation (§3·§4)', () => {
  describe('gradeToBand', () => {
    it('등급을 밴드로 매핑', () => {
      expect(gradeToBand(1)).toBe('1-2');
      expect(gradeToBand(2)).toBe('1-2');
      expect(gradeToBand(3)).toBe('3-4');
      expect(gradeToBand(6)).toBe('5-6');
      expect(gradeToBand(9)).toBe('7-9');
    });
    it('범위 밖은 null', () => {
      expect(gradeToBand(0)).toBeNull();
      expect(gradeToBand(10)).toBeNull();
      expect(gradeToBand(NaN)).toBeNull();
    });
  });

  describe('toBandPercent — 노출은 %만, 합 100', () => {
    it('분포를 %로, 개별 등급 미보존', () => {
      const pct = toBandPercent([1, 1, 3, 5, 8]); // 1-2:2, 3-4:1, 5-6:1, 7-9:1
      expect(pct['1-2']).toBe(40);
      expect(pct['3-4']).toBe(20);
      expect(pct['5-6']).toBe(20);
      expect(pct['7-9']).toBe(20);
      expect(Object.values(pct).reduce((a, b) => a + b, 0)).toBe(100);
    });
    it('반올림 오차 보정으로 합 100', () => {
      const pct = toBandPercent([1, 3, 5]); // 각 33.33 → 보정
      expect(Object.values(pct).reduce((a, b) => a + b, 0)).toBe(100);
    });
    it('유효 등급 없으면 빈 분포', () => {
      expect(toBandPercent([])).toEqual({});
      expect(toBandPercent([0, 10])).toEqual({});
    });
  });

  describe('kAnonSchoolDist — n<minN 은 기타 합산', () => {
    it('minN 이상만 개별 노출, 나머지 기타', () => {
      const schools = [
        ...Array(6).fill('○○고'),
        ...Array(5).fill('△△고'),
        ...Array(3).fill('□□고'),
        ...Array(2).fill('◇◇고'),
      ];
      const dist = kAnonSchoolDist(schools, 5);
      const map = Object.fromEntries(dist.map((d) => [d.school, d.n]));
      expect(map['○○고']).toBe(6);
      expect(map['△△고']).toBe(5);
      expect(map['□□고']).toBeUndefined(); // n<5 → 기타
      expect(map['◇◇고']).toBeUndefined();
      expect(map['기타']).toBe(5); // 3+2
    });
    it('빈 학교명·공백은 무시', () => {
      const dist = kAnonSchoolDist(
        [null, '', '  ', ...Array(5).fill('A고')],
        5,
      );
      expect(dist).toEqual([{ school: 'A고', n: 5 }]);
    });
    it('모두 소수면 기타로만', () => {
      const dist = kAnonSchoolDist(['A', 'A', 'B', 'B'], 5);
      expect(dist).toEqual([{ school: '기타', n: 4 }]);
    });
    it('n 내림차순 정렬(기타는 마지막)', () => {
      const schools = [
        ...Array(8).fill('큰고'),
        ...Array(6).fill('중고'),
        ...Array(2).fill('소고'),
      ];
      const dist = kAnonSchoolDist(schools, 5);
      expect(dist.map((d) => d.school)).toEqual(['큰고', '중고', '기타']);
    });
  });

  it('VERIFIED_MIN_N 기본 5', () => {
    expect(VERIFIED_MIN_N).toBe(5);
  });
});
