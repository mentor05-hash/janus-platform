import { describe, expect, it } from 'vitest';
import { assignCohort, weeklyBoard } from './cohort';
import { addDays } from './date';
import type { Cohort, CohortMember, Todo } from './schema';

const WEEK = '2026-08-03'; // 월요일

const member = (id: string, dormant = false): CohortMember => ({
  anon_id: id,
  nickname: `닉_${id}`,
  joined: '2026-07-01',
  dormant,
});

const todo = (date: string, qty: number, done: boolean): Todo => ({
  plan_id: 'p1',
  date,
  tasks: [{ content_ref: 'book:rpm', unit_label: `${qty}`, qty, done }],
  locked: false,
});

const cohort: Cohort = {
  id: 'high-2026S-1',
  band: 'high',
  season: '2026S',
  capacity: 25,
  members: [member('m1'), member('m2'), member('m3'), member('m4'), member('m5', true)],
};

const todosByMember: Record<string, Todo[]> = {
  m1: [todo(WEEK, 20, true)],
  m2: [0, 1, 2].map((i) => todo(addDays(WEEK, i), 5, true)),
  m3: [todo(WEEK, 10, false), todo(addDays(WEEK, 1), 10, true)],
  m4: [todo(WEEK, 5, true)],
  m5: [todo(WEEK, 100, true)], // 휴면 — 집계에서 빠져야 한다
};

describe('스펙 §3-8 — 주간 빌보드', () => {
  const board = weeklyBoard(cohort, todosByMember, WEEK, { meAnonId: 'm4' });

  it('집계 창은 월~일이고 휴면 멤버는 제외된다', () => {
    expect(board.week_start).toBe(WEEK);
    expect(board.week_end).toBe(addDays(WEEK, 6));
    expect(board.participants).toBe(4);
    const everyone = Object.values(board.sections).flatMap((s) => s.top3.map((e) => e.anon_id));
    expect(everyone).not.toContain('m5');
  });

  it('completed — 주간 완료 분량 top3', () => {
    expect(board.sections.completed.top3).toEqual([
      { anon_id: 'm1', nickname: '닉_m1', value: 20 },
      { anon_id: 'm2', nickname: '닉_m2', value: 15 },
      { anon_id: 'm3', nickname: '닉_m3', value: 10 },
    ]);
  });

  it('streak — 연속 전량 완수일', () => {
    expect(board.sections.streak.top3[0]).toEqual({
      anon_id: 'm2',
      nickname: '닉_m2',
      value: 3,
    });
  });

  it('recovery — 전일 미완 → 당일 전량 완수 횟수', () => {
    expect(board.sections.recovery.top3[0]).toEqual({
      anon_id: 'm3',
      nickname: '닉_m3',
      value: 1,
    });
  });

  it('본인에게는 순위 숫자가 아니라 상위 구간만 준다', () => {
    expect(board.sections.completed.me).toEqual({ value: 5, top_percent: 100 });
    expect(board.sections.completed).not.toHaveProperty('bottom3');
  });

  it('self_best — 직전 4주 최고 주간 완료량 대비 증가율(%)', () => {
    const grower: Record<string, Todo[]> = {
      m1: [
        todo(addDays(WEEK, -7), 10, true), // 지난주 10
        todo(WEEK, 15, true), // 이번주 15 → +50%
      ],
    };
    const b = weeklyBoard(
      { ...cohort, members: [member('m1')] },
      grower,
      WEEK,
      { meAnonId: 'm1' },
    );
    expect(b.sections.self_best.top3[0].value).toBe(50);
  });

  it('D-006 — 성적·등급 필드는 타입 차원에서 주입할 수 없다', () => {
    // @ts-expect-error 성적 필드 금지(리터럴 경로)
    const literal: CohortMember = { ...member('mX'), score: 92 };
    const wide = { ...member('mY'), grade: 1 };
    // @ts-expect-error 성적 필드 금지(변수 경유 경로)
    const viaVar: CohortMember = wide;
    // @ts-expect-error 크레딧·보상액 금지(D-004)
    const reward: CohortMember = { ...member('mZ'), credit: 1000 };

    expect([literal, viaVar, reward]).toHaveLength(3);
  });
});

describe('스펙 §3-9 — 반 편성', () => {
  const members = (n: number) =>
    Array.from({ length: n }, (_, i) => member(`a${String(i).padStart(2, '0')}`));

  it('같은 band+season 의 정원 미달 반에 배정한다', () => {
    const open: Cohort = { ...cohort, members: members(24) };
    expect(assignCohort({ band: 'high', season: '2026S' }, [open]).id).toBe(open.id);
  });

  it('정원 25가 차면 새 반을 만든다', () => {
    const full: Cohort = { ...cohort, members: members(25) };
    const next = assignCohort({ band: 'high', season: '2026S' }, [full]);

    expect(next.id).toBe('high-2026S-2');
    expect(next.members).toEqual([]);
    expect(next.capacity).toBe(25);
    expect(full.members).toHaveLength(25); // 입력을 변형하지 않는다
  });

  it('band·season 이 다르면 재사용하지 않는다', () => {
    const full: Cohort = { ...cohort, members: members(10) };
    const next = assignCohort({ band: 'middle', season: '2026S' }, [full]);

    expect(next.id).toBe('middle-2026S-1');
  });
});
