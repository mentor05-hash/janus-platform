import { homeroomGap } from './homeroom';

describe('homeroomGap (순수)', () => {
  const now = new Date('2026-06-30T00:00:00Z');
  const policy = { cycleDays: 30, warnDays: 20, dangerDays: 40 };

  it('마지막 담임 상담 없음 → none', () => {
    const g = homeroomGap(null, policy, now);
    expect(g.level).toBe('none');
    expect(g.daysSince).toBeNull();
    expect(g.lastHomeroomAt).toBeNull();
  });

  it('경과일 < warn → ok', () => {
    const g = homeroomGap(new Date('2026-06-20T00:00:00Z'), policy, now); // 10일
    expect(g.daysSince).toBe(10);
    expect(g.level).toBe('ok');
  });

  it('warn ≤ 경과일 < danger → warn', () => {
    const g = homeroomGap(new Date('2026-06-05T00:00:00Z'), policy, now); // 25일
    expect(g.daysSince).toBe(25);
    expect(g.level).toBe('warn');
  });

  it('경과일 ≥ danger → danger', () => {
    const g = homeroomGap(new Date('2026-05-10T00:00:00Z'), policy, now); // 51일
    expect(g.level).toBe('danger');
  });

  it('warn 미설정 시 cycleDays 로 대체', () => {
    const g = homeroomGap(
      new Date('2026-05-25T00:00:00Z'),
      {
        cycleDays: 30,
        warnDays: null,
        dangerDays: null,
      },
      now,
    ); // 36일 ≥ 30
    expect(g.level).toBe('warn');
  });

  it('임계 전무(all null) → 항상 ok', () => {
    const g = homeroomGap(
      new Date('2020-01-01T00:00:00Z'),
      {
        cycleDays: null,
        warnDays: null,
        dangerDays: null,
      },
      now,
    );
    expect(g.level).toBe('ok');
  });
});
