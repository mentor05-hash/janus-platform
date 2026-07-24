import { describe, expect, it } from 'vitest';
import { addDays, dowOf } from './date';
import { dayIndexInPeriod, distribute } from './distribute';
import { PlannerError, type Availability, type PlanItem } from './schema';

/** 2026-08-03 은 월요일 — 아래 기간 계산의 전제. */
const MON = '2026-08-03';

const noAvailability: Availability = { user_id: 'u1', weekly_slots: [], exceptions: [] };

const item = (over: Partial<PlanItem>): PlanItem => ({
  content_ref: 'book:수학의정석',
  total_units: 60,
  unit_type: 'problem',
  split_mode: 'd_day',
  study_pattern: 'no_weekend',
  ...over,
});

describe('스펙 §3-1 — d_day 분배', () => {
  it('전제: 2026-08-03 은 월요일', () => {
    expect(dowOf(MON)).toBe(1);
  });

  it('총 60문제·주말 제외·4주(20 학습일) → 일 3문제, 마지막 날 잔여 정확', () => {
    const period = { start: MON, end: addDays(MON, 27) }; // 4주
    const r = distribute(item({}), noAvailability, period, { planId: 'p1' });

    expect(r.todos).toHaveLength(20);
    expect(r.todos.every((t) => t.tasks[0].qty === 3)).toBe(true);
    expect(r.todos.reduce((s, t) => s + t.tasks[0].qty, 0)).toBe(60);
    expect(r.todos.at(-1)!.tasks[0].qty).toBe(3); // 마지막 날 잔여
    expect(r.expectedEndDate).toBe('2026-08-28'); // 4주차 금요일
    expect(r.flags).toEqual([]);
  });

  it('나누어떨어지지 않으면 ceil 배정 후 마지막 날이 잔여를 받는다', () => {
    const period = { start: MON, end: addDays(MON, 3) }; // 월~목 4일
    const r = distribute(
      item({ total_units: 10, study_pattern: 'daily' }),
      noAvailability,
      period,
    );

    expect(r.todos.map((t) => t.tasks[0].qty)).toEqual([3, 3, 3, 1]);
    expect(r.expectedEndDate).toBe(addDays(MON, 3));
  });
});

describe('스펙 §3-2 — per_day 분배', () => {
  it('하루 1강·격일·총 10강 → 예상 종료일이 기간 19일차', () => {
    const period = { start: MON, end: addDays(MON, 40) };
    const r = distribute(
      item({
        content_ref: 'lecture:seed-598',
        total_units: 10,
        unit_type: 'lecture',
        split_mode: 'per_day',
        per_day: 1,
        study_pattern: 'alt',
      }),
      noAvailability,
      period,
    );

    expect(r.todos).toHaveLength(10);
    expect(r.todos.every((t) => t.tasks[0].qty === 1)).toBe(true);
    expect(r.expectedEndDate).toBe(addDays(MON, 18));
    expect(dayIndexInPeriod(period, r.expectedEndDate!)).toBe(19);
    expect(r.todos[0].tasks[0].unit_label).toBe('1강');
  });
});

describe('스펙 §3-3 — env 배정', () => {
  const availability: Availability = {
    user_id: 'u1',
    weekly_slots: [
      { dow: 1, start: '08:00', end: '09:00', env: 'transit' }, // 월: 이동 중만
      { dow: 2, start: '19:00', end: '21:00', env: 'study' }, // 화: 독서실
    ],
    exceptions: [],
  };
  const period = { start: MON, end: addDays(MON, 1) }; // 월~화

  it('transit 슬롯만 있는 날에는 problem 을 배정하지 않는다', () => {
    const r = distribute(
      item({ total_units: 4, unit_type: 'problem', study_pattern: 'daily' }),
      availability,
      period,
    );

    expect(r.todos).toHaveLength(1);
    expect(r.todos[0].date).toBe(addDays(MON, 1)); // 화요일에만
    expect(r.flags).toContain('env_deferred');
  });

  it('lecture 는 transit 날에도 배정된다(이동 중 인강)', () => {
    const r = distribute(
      item({ total_units: 4, unit_type: 'lecture', study_pattern: 'daily' }),
      availability,
      period,
    );

    expect(r.todos.map((t) => t.date)).toEqual([MON, addDays(MON, 1)]);
    expect(r.flags).not.toContain('env_deferred');
  });

  it('env_pref 가 있으면 기본 매핑보다 우선한다', () => {
    const r = distribute(
      item({ total_units: 4, unit_type: 'problem', study_pattern: 'daily', env_pref: ['transit'] }),
      availability,
      period,
    );

    expect(r.todos.map((t) => t.date)).toEqual([MON]); // transit 인 월요일만
  });
});

describe('§2-1 엣지', () => {
  it('학습일이 0이면 빈 계획을 만들지 않고 오류를 낸다', () => {
    const period = { start: '2026-08-08', end: '2026-08-09' }; // 토·일
    expect(() => distribute(item({}), noAvailability, period)).toThrowError(PlannerError);
    try {
      distribute(item({}), noAvailability, period);
    } catch (e) {
      expect((e as PlannerError).code).toBe('EMPTY_PLAN');
    }
  });

  it('exceptions off 는 학습일에서 빼고, add 는 패턴 밖의 날도 넣는다', () => {
    const availability: Availability = {
      user_id: 'u1',
      weekly_slots: [],
      exceptions: [
        { date: addDays(MON, 1), delta: 'off' }, // 화요일 휴무
        { date: '2026-08-08', delta: 'add' }, // 토요일 추가(no_weekend 예외)
      ],
    };
    const period = { start: MON, end: '2026-08-08' };
    const r = distribute(item({ total_units: 10 }), availability, period);

    const dates = r.todos.map((t) => t.date);
    expect(dates).not.toContain(addDays(MON, 1));
    expect(dates).toContain('2026-08-08');
  });

  it('total_units 가 학습일수보다 적으면 압축 제안 플래그를 단다', () => {
    const period = { start: MON, end: addDays(MON, 27) };
    const r = distribute(item({ total_units: 5 }), noAvailability, period);

    expect(r.flags).toContain('compress_suggest');
    expect(r.todos.reduce((s, t) => s + t.tasks[0].qty, 0)).toBe(5);
  });

  it('per_day 로 기간 안에 소진하지 못하면 period_too_short', () => {
    const period = { start: MON, end: addDays(MON, 2) };
    const r = distribute(
      item({ total_units: 30, split_mode: 'per_day', per_day: 1, study_pattern: 'daily' }),
      noAvailability,
      period,
    );

    expect(r.flags).toContain('period_too_short');
    expect(r.todos).toHaveLength(3);
  });
});
