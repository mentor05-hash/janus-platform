import { aggregateSubjectStats, OTHER_SUBJECT } from './qna-subject-stat';
import { DEFAULT_LEAGUE_POLICY } from './qna-league';

describe('aggregateSubjectStats (N33 과목 오각형 원천)', () => {
  it('빈 입력은 빈 배열', () => {
    expect(aggregateSubjectStats([])).toEqual([]);
  });

  it('과목별 답변수·채택수·채택률 집계', () => {
    const stats = aggregateSubjectStats([
      { subject: '수학', accepted: true },
      { subject: '수학', accepted: true },
      { subject: '수학', accepted: false },
      { subject: '영어', accepted: false },
    ]);
    const math = stats.find((s) => s.subject === '수학')!;
    const eng = stats.find((s) => s.subject === '영어')!;
    expect(math.authored).toBe(3);
    expect(math.accepted).toBe(2);
    expect(math.acceptRate).toBe(67); // round(2/3*100)
    expect(eng.authored).toBe(1);
    expect(eng.accepted).toBe(0);
    expect(eng.acceptRate).toBe(0);
  });

  it('null/빈 과목은 기타로 합산', () => {
    const stats = aggregateSubjectStats([
      { subject: null, accepted: true },
      { subject: '', accepted: false },
      { subject: '  ', accepted: false },
    ]);
    expect(stats).toHaveLength(1);
    expect(stats[0].subject).toBe(OTHER_SUBJECT);
    expect(stats[0].authored).toBe(3);
    expect(stats[0].accepted).toBe(1);
  });

  it('정렬: 채택수 내림차순, 기타는 항상 끝', () => {
    const stats = aggregateSubjectStats([
      { subject: null, accepted: true },
      { subject: null, accepted: true },
      { subject: '영어', accepted: true },
      { subject: '수학', accepted: true },
      { subject: '수학', accepted: true },
    ]);
    expect(stats.map((s) => s.subject)).toEqual(['수학', '영어', OTHER_SUBJECT]);
  });

  it('과목별 리그 등급 = 리그 정책 재사용(요건 충족 과목만 승급)', () => {
    // promote2 기본: minAuthored 5·minAccepted 3·minRate 50
    const rows = Array.from({ length: 6 }, () => ({ subject: '수학', accepted: true }))
      .concat(Array.from({ length: 2 }, () => ({ subject: '영어', accepted: true })));
    const stats = aggregateSubjectStats(rows, DEFAULT_LEAGUE_POLICY);
    const math = stats.find((s) => s.subject === '수학')!;
    const eng = stats.find((s) => s.subject === '영어')!;
    expect(math.tier).toBeLessThanOrEqual(2); // 요건 충족 → 승급
    expect(eng.tier).toBe(3); // 표본 부족 → 입문 유지
  });
});
