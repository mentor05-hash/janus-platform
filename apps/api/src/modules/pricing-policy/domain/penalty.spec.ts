import { evaluatePenalty } from './penalty';

const T = { cancelThreshold: 3, noshowThreshold: 2, rejectThreshold: 5, rankingWeightDown: 0.3 };

describe('가중 제한(§5-7)', () => {
  it('임계 미만이면 제한 없음', () => {
    const r = evaluatePenalty({ cancelCount: 2, noshowCount: 1, rejectCount: 4 }, T);
    expect(r.restricted).toBe(false);
    expect(r.rankingWeightDown).toBe(0);
  });

  it('노쇼 임계 도달 시 제한 + 랭킹 가중치 하락', () => {
    const r = evaluatePenalty({ cancelCount: 0, noshowCount: 2, rejectCount: 0 }, T);
    expect(r.restricted).toBe(true);
    expect(r.reasons).toContain('noshow');
    expect(r.rankingWeightDown).toBe(0.3);
  });

  it('미설정(null) 임계는 제한에 영향 없음', () => {
    const r = evaluatePenalty(
      { cancelCount: 99, noshowCount: 99, rejectCount: 99 },
      { cancelThreshold: null, noshowThreshold: null, rejectThreshold: null, rankingWeightDown: null },
    );
    expect(r.restricted).toBe(false);
  });

  it('restrictMinutes 경과 시 제한 자동 해제(일시 제한)', () => {
    const stats = { cancelCount: 0, noshowCount: 2, rejectCount: 0 };
    const since = 1_000_000_000_000;
    // 창 이내(30분 중 10분 경과) → 제한 유지
    const within = evaluatePenalty(stats, T, { restrictMinutes: 30, penaltySinceMs: since, nowMs: since + 10 * 60_000 });
    expect(within.restricted).toBe(true);
    expect(within.lifted).toBe(false);
    // 창 경과(30분 초과) → 해제
    const after = evaluatePenalty(stats, T, { restrictMinutes: 30, penaltySinceMs: since, nowMs: since + 31 * 60_000 });
    expect(after.restricted).toBe(false);
    expect(after.lifted).toBe(true);
    expect(after.rankingWeightDown).toBe(0);
  });

  it('restrictMinutes=null(무기한)이면 창 해제 없음', () => {
    const r = evaluatePenalty(
      { cancelCount: 0, noshowCount: 2, rejectCount: 0 },
      T,
      { restrictMinutes: null, penaltySinceMs: 1_000, nowMs: 9_999_999_999 },
    );
    expect(r.restricted).toBe(true);
    expect(r.lifted).toBe(false);
  });
});
