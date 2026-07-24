import { describe, expect, it } from 'vitest';
import { carryOver } from './carryover';
import { addDays } from './date';
import type { Todo } from './schema';

const day = (date: string, qty: number, done = false): Todo => ({
  plan_id: 'p1',
  date,
  tasks: [{ content_ref: 'book:rpm', unit_label: `${qty}문제`, qty, done }],
  locked: false,
});

const START = '2026-08-03';
const TODAY = '2026-08-06'; // 과거 3일(8/3~8/5) + 오늘 포함 잔여 7일(8/6~8/12)

/** 과거 3일 미완(각 3문제 = 9) + 잔여 7일. */
const build = (futureQty: number): Todo[] => [
  ...[0, 1, 2].map((i) => day(addDays(START, i), 3)),
  ...[0, 1, 2, 3, 4, 5, 6].map((i) => day(addDays(TODAY, i), futureQty)),
];

describe('스펙 §3-4 — 이월 keep_deadline(기간 사수)', () => {
  it('3일 미완 9문제 → 잔여 7일에 가중 분배안을 만든다', () => {
    const r = carryOver(build(3), 'keep_deadline', { today: TODAY });

    expect(r.carriedUnits).toBe(9);
    expect(r.proposal).toHaveLength(7);
    expect(r.proposal.reduce((s, p) => s + p.add, 0)).toBe(9);
    expect(r.proposal.map((p) => p.add)).toEqual([2, 2, 1, 1, 1, 1, 1]);
  });

  it('일일 상한(기존 최대 배정량 × 1.5) 초과 시 재분배하지 않고 extend 를 제안한다', () => {
    const r = carryOver(build(3), 'keep_deadline', { today: TODAY });

    expect(r.dailyCap).toBe(4.5); // 3 × 1.5
    expect(r.applied).toBe(false); // 3 + 2 = 5 > 4.5 → 욱여넣기 금지
    expect(r.flags).toContain('extend');
    // 원장은 손대지 않는다.
    expect(r.todos.filter((t) => t.date < TODAY).every((t) => t.tasks.length === 1)).toBe(true);
  });

  it('상한 안이면 실제로 재분배하고 carried_from 을 남긴다', () => {
    const r = carryOver(build(10), 'keep_deadline', { today: TODAY });

    expect(r.dailyCap).toBe(15); // 10 × 1.5
    expect(r.applied).toBe(true);

    const past = r.todos.filter((t) => t.date < TODAY);
    const future = r.todos.filter((t) => t.date >= TODAY);
    expect(past.every((t) => t.tasks.length === 0)).toBe(true); // 과거 원장은 비워진다

    const carried = future.flatMap((t) => t.tasks.filter((k) => k.carried_from));
    expect(carried.reduce((s, k) => s + k.qty, 0)).toBe(9);
    expect(carried.every((k) => k.carried_from! < TODAY)).toBe(true);
    expect(future[0].tasks.filter((k) => k.carried_from).reduce((s, k) => s + k.qty, 0)).toBe(2);
  });

  it('잔여 학습일이 없으면 재분배 불가 + extend', () => {
    const todos = [0, 1, 2].map((i) => day(addDays(START, i), 3));
    const r = carryOver(todos, 'keep_deadline', { today: TODAY });

    expect(r.applied).toBe(false);
    expect(r.flags).toEqual(['no_remaining_days', 'extend']);
  });

  it('미완이 없으면 아무것도 옮기지 않는다', () => {
    const todos = [0, 1, 2].map((i) => day(addDays(START, i), 3, true));
    const r = carryOver(todos, 'keep_deadline', { today: TODAY });

    expect(r.carriedUnits).toBe(0);
    expect(r.proposal).toEqual([]);
    expect(r.flags).toEqual([]);
  });
});

describe('스펙 §3-5 — 이월 keep_pace(강도 사수)', () => {
  const PACE_TODAY = '2026-08-10';

  it('avg_daily_done 2 · 잔여 20 → 완료일 +10일', () => {
    const todos: Todo[] = [
      // 최근 7일 실측: 매일 2개 계획·완료 → 평균 2
      ...[0, 1, 2, 3, 4, 5, 6].map((i) => day(addDays('2026-08-03', i), 2, true)),
      // 잔여 20 (10일 × 2)
      ...Array.from({ length: 10 }, (_, i) => day(addDays(PACE_TODAY, i), 2)),
    ];

    const r = carryOver(todos, 'keep_pace', { today: PACE_TODAY });

    expect(r.avgDailyDone).toBe(2);
    expect(r.projectedEndDate).toBe(addDays(PACE_TODAY, 10));
    expect(r.flags).not.toContain('planned_fallback');
    expect(r.applied).toBe(true);
  });

  it('표본 7일 미만이면 계획량으로 대체하고 플래그를 단다', () => {
    const todos: Todo[] = [
      ...[0, 1, 2].map((i) => day(addDays('2026-08-07', i), 2, true)),
      ...Array.from({ length: 5 }, (_, i) => day(addDays(PACE_TODAY, i), 2)),
    ];

    const r = carryOver(todos, 'keep_pace', { today: PACE_TODAY });

    expect(r.flags).toContain('planned_fallback');
    expect(r.avgDailyDone).toBe(2); // 계획량 평균
  });
});
