import { summarizeClinic } from './clinic';

describe('summarizeClinic — 약점 클리닉 추이 요약', () => {
  it('표본 없음 → 전부 null', () => {
    expect(summarizeClinic([])).toEqual({
      count: 0,
      avgScore: null,
      bestScore: null,
      improvement: null,
    });
  });

  it('1회 → 향상도 0(최초=최근)', () => {
    expect(summarizeClinic([70])).toEqual({
      count: 1,
      avgScore: 70,
      bestScore: 70,
      improvement: 0,
    });
  });

  it('향상 추이 — 평균 반올림·최고·향상도', () => {
    // [40,60,80] 평균 60, 최고 80, 향상 80-40=40
    expect(summarizeClinic([40, 60, 80])).toEqual({
      count: 3,
      avgScore: 60,
      bestScore: 80,
      improvement: 40,
    });
  });

  it('하락 추이 → 음수 향상도', () => {
    expect(summarizeClinic([90, 50]).improvement).toBe(-40);
  });

  it('평균은 정수 반올림', () => {
    // [50,55] 평균 52.5 → 53
    expect(summarizeClinic([50, 55]).avgScore).toBe(53);
  });
});
