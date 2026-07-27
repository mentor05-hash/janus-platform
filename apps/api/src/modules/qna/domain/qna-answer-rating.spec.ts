import {
  aggregateAxisStats,
  isPentagonVisible,
  isValidAxis,
  isValidScore,
  RATING_AXES,
  visibleAxisCount,
} from './qna-answer-rating';

describe('aggregateAxisStats (N33 설명방식 오각형)', () => {
  it('빈 입력 — 5축 모두 count 0·avg null·순서 고정', () => {
    const out = aggregateAxisStats([]);
    expect(out.map((a) => a.axis)).toEqual([...RATING_AXES]);
    expect(out.every((a) => a.count === 0 && a.avg === null)).toBe(true);
  });

  it('표본 미달(n<minSample) 축은 avg null(게이트)', () => {
    const out = aggregateAxisStats([{ axis: 'accuracy', score: 5 }], 5);
    const acc = out.find((a) => a.axis === 'accuracy')!;
    expect(acc.count).toBe(1);
    expect(acc.avg).toBeNull(); // 1건 5점 만점 레이더 방지
  });

  it('표본 충족 시 평균(소수 1자리)', () => {
    const rows = [4, 5, 4, 5, 5].map((score) => ({ axis: 'logic', score }));
    const out = aggregateAxisStats(rows, 5);
    const logic = out.find((a) => a.axis === 'logic')!;
    expect(logic.count).toBe(5);
    expect(logic.avg).toBe(4.6); // 23/5
  });

  it('무효 축·점수는 무시', () => {
    const rows = [
      { axis: 'accuracy', score: 5 },
      { axis: 'bogus', score: 5 },
      { axis: 'accuracy', score: 9 },
      { axis: 'accuracy', score: 0 },
    ];
    const out = aggregateAxisStats(rows, 1);
    const acc = out.find((a) => a.axis === 'accuracy')!;
    expect(acc.count).toBe(1); // 유효한 5점 1건만
    expect(acc.avg).toBe(5);
  });

  it('축·점수 유효성 검사', () => {
    expect(isValidAxis('kindness')).toBe(true);
    expect(isValidAxis('nope')).toBe(false);
    expect(isValidScore(3)).toBe(true);
    expect(isValidScore(0)).toBe(false);
    expect(isValidScore(6)).toBe(false);
    expect(isValidScore(3.5)).toBe(false);
  });

  it('㉙ 오각형 전체 게이트 — 통과 축이 0이면 비표시, 1축이라도 통과하면 표시', () => {
    const none = aggregateAxisStats([{ axis: 'accuracy', score: 5 }], 5); // 1건 → 통과 축 0
    expect(visibleAxisCount(none)).toBe(0);
    expect(isPentagonVisible(none)).toBe(false); // 거짓 레이더 차단

    const one = aggregateAxisStats(
      [4, 5, 4, 5, 5].map((score) => ({ axis: 'logic', score })),
      5,
    );
    expect(visibleAxisCount(one)).toBe(1);
    expect(isPentagonVisible(one)).toBe(true); // 1축 통과 → 렌더
  });
});
