import { describe, it, expect } from 'vitest';
import { bandOf, computeSubjectGaps, avgSpread, BAND_COLOR, type TrendLike } from './gap';

/**
 * 이 스펙은 **임계값·어휘를 고정**한다 — apps/mobile/src/lib/gap.ts 와 갈라지면 여기서 깨져야 한다.
 * 밴드 어휘는 트렁크 gap-report 정본(안정/적정/소신/상향)이고, 임계값은 과목 점수 척도용 비율(8%/25%)이다.
 */
describe('bandOf (실행층 — 목표 대비 비율)', () => {
  it('정본 어휘만 반환한다', () => {
    expect(Object.keys(BAND_COLOR).sort()).toEqual(['상향', '소신', '안정', '적정'].sort());
  });
  it('격차 0 이하 → 안정', () => {
    expect(bandOf(0, 90)).toBe('안정');
    expect(bandOf(-5, 90)).toBe('안정');
  });
  it('목표의 8% 이내 → 적정 (경계 포함)', () => {
    expect(bandOf(7.2, 90)).toBe('적정'); // 8.0%
    expect(bandOf(2, 90)).toBe('적정');
  });
  it('8% 초과 ~ 25% 이하 → 소신', () => {
    expect(bandOf(7.3, 90)).toBe('소신');
    expect(bandOf(22.5, 90)).toBe('소신'); // 25.0%
  });
  it('25% 초과 → 상향', () => {
    expect(bandOf(22.6, 90)).toBe('상향');
    expect(bandOf(28, 90)).toBe('상향');
  });
  it('API 정본의 절대 ±0.5 기준을 쓰지 않는다(100점 척도에서 1점 부족은 상향이 아니다)', () => {
    expect(bandOf(1, 90)).toBe('적정');
  });
});

const trend = (subjects: Array<[string, number | null]>, avg: number | null, goalAvg: number | null): TrendLike => ({
  goal: { avg: goalAvg },
  points: [{ period: '2026-06', examType: '내신', avg, subjects: subjects.map(([s, v]) => ({ subject: s, score: v })) }],
});

describe('computeSubjectGaps', () => {
  it('미달 과목만 격차 양수 + 격차 큰 순 정렬', () => {
    const m = computeSubjectGaps(trend([['수학', 62], ['영어', 88], ['국어', 95]], 81.7, 90))!;
    expect(m.subjects.map((s) => s.subject)).toEqual(['수학', '영어', '국어']);
    expect(m.subjects[0].gap).toBe(28);
    expect(m.subjects.map((s) => s.band)).toEqual(['상향', '적정', '안정']);
    expect(m.weakest?.subject).toBe('수학'); // 격차 최대
    expect(m.overallGap).toBe(8.3);
  });
  it('목표 평균이 없으면 과목별 계산을 하지 않는다', () => {
    const m = computeSubjectGaps(trend([['수학', 62]], 62, null))!;
    expect(m.goalAvg).toBeNull();
    expect(m.subjects).toEqual([]);
  });
  it('표준점수 회차(100 초과)는 척도 불일치로 계산 생략', () => {
    const m = computeSubjectGaps(trend([['국어', 131], ['수학', 135]], null, 90))!;
    expect(m.scaleMismatch).toBe(true);
    expect(m.subjects).toEqual([]);
  });
  it('점수 없는 과목은 제외', () => {
    const m = computeSubjectGaps(trend([['영어', null], ['수학', 70]], 70, 90))!;
    expect(m.subjects.map((s) => s.subject)).toEqual(['수학']);
  });
});

describe('avgSpread (회차 변동 폭)', () => {
  it('평균은 높을수록 상위 — best=max, worst=min', () => {
    const t: TrendLike = { goal: { avg: 90 }, points: [
      { period: 'a', examType: null, avg: 78, subjects: [] },
      { period: 'b', examType: null, avg: 85.5, subjects: [] },
    ] };
    expect(avgSpread(t)).toEqual({ count: 2, best: 85.5, worst: 78, spread: 7.5 });
  });
  it('회차가 2회 미만이면 null', () => {
    expect(avgSpread({ goal: {}, points: [{ period: 'a', examType: null, avg: 80, subjects: [] }] })).toBeNull();
  });
});
