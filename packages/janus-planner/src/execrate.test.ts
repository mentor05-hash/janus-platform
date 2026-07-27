import { describe, expect, it } from 'vitest';
import { addDays } from './date';
import { execRate } from './execrate';
import type { Todo } from './schema';

const TODAY = '2026-08-15';
const first = (i: number) => addDays('2026-08-05', i); // 오늘 기준 지난 10일

const todo = (date: string, tasks: { qty: number; done: boolean }[]): Todo => ({
  plan_id: 'p1',
  date,
  tasks: tasks.map((t, i) => ({ content_ref: 'book:rpm', unit_label: `t${i}`, ...t })),
  locked: false,
});

/** 창 안 계획 100 · 완료 62. */
const window62: Todo[] = [
  ...Array.from({ length: 6 }, (_, i) => todo(first(i), [{ qty: 10, done: true }])),
  todo(first(6), [{ qty: 2, done: true }, { qty: 8, done: false }]),
  ...Array.from({ length: 3 }, (_, i) => todo(first(7 + i), [{ qty: 10, done: false }])),
];

describe('스펙 §3-6 — 실행능력 계수', () => {
  it('계획 100 · 완료 62 → rate 0.62', () => {
    const r = execRate(window62, { today: TODAY });

    expect(r.sampleDays).toBe(10);
    expect(r.rate).toBeCloseTo(0.62, 10);
    expect(r.status).toBe('ok');
  });

  it('12주 계획을 rate 0.62 로 소화하면 20주가 필요하다(ceil — 미달 계획 미제시)', () => {
    const r = execRate(window62, {
      today: TODAY,
      plannedWeeks: 12,
      remainingUnits: 240, // 주당 20 × 12주
    });

    // 240 / (20 × 0.62) = 19.35… → 올림 20
    expect(r.needed_weeks).toBe(20);
    expect(r.options).toEqual(['extend', 'add_hours', 'reduce_scope']);
  });

  it('재추정이 계획을 넘지 않으면 재설계 선택지를 제시하지 않는다', () => {
    const onTrack: Todo[] = Array.from({ length: 10 }, (_, i) =>
      todo(first(i), [{ qty: 10, done: true }]),
    );
    const r = execRate(onTrack, { today: TODAY, plannedWeeks: 12, remainingUnits: 240 });

    expect(r.rate).toBe(1);
    expect(r.needed_weeks).toBe(12);
    expect(r.options).toEqual([]);
  });
});

describe('스펙 §3-7 — 표본 부족·정체', () => {
  it('표본 5일이면 rate 를 내지 않는다', () => {
    const few = Array.from({ length: 5 }, (_, i) => todo(first(i), [{ qty: 10, done: true }]));
    const r = execRate(few, { today: TODAY, plannedWeeks: 12, remainingUnits: 240 });

    expect(r.sampleDays).toBe(5);
    expect(r.rate).toBeNull();
    expect(r.needed_weeks).toBeNull();
    expect(r.status).toBe('insufficient');
  });

  it('전량 미완이면 needed_weeks 대신 stalled 상태로 알린다', () => {
    const none = Array.from({ length: 10 }, (_, i) => todo(first(i), [{ qty: 10, done: false }]));
    const r = execRate(none, { today: TODAY, plannedWeeks: 12, remainingUnits: 240 });

    expect(r.rate).toBe(0);
    expect(r.needed_weeks).toBeNull(); // Infinity 를 밖으로 내보내지 않는다
    expect(r.status).toBe('stalled');
    expect(r.options).toEqual(['extend', 'add_hours', 'reduce_scope']);
  });
});
