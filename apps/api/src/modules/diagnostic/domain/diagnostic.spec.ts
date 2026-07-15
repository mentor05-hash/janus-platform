import { scorePct, weaknessByUnit, prescribe } from './diagnostic';

const g = (unit: string, correct: boolean, subject = '수학') => ({ questionId: 'q', unit, subject, correct });

describe('수준진단 채점·약점', () => {
  it('정답률', () => {
    expect(scorePct(0, 0)).toBe(0);
    expect(scorePct(3, 4)).toBe(75);
  });

  it('유형별 약점(60% 미만)', () => {
    const stats = weaknessByUnit([
      g('미적분', false), g('미적분', false), g('미적분', true), // 33% → 약점
      g('대수', true), g('대수', true), // 100% → 정상
    ]);
    const mi = stats.find((s) => s.unit === '미적분')!;
    const de = stats.find((s) => s.unit === '대수')!;
    expect(mi.rate).toBe(33);
    expect(mi.weak).toBe(true);
    expect(de.weak).toBe(false);
    expect(stats[0].unit).toBe('미적분'); // 약한 순 정렬
  });

  it('처방은 약점만', () => {
    const stats = weaknessByUnit([g('미적분', false), g('대수', true)]);
    const p = prescribe(stats);
    expect(p.length).toBe(1);
    expect(p[0].unit).toBe('미적분');
  });
});
