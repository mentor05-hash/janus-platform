import { addDays, mondayOf, weekDates, type ISODate } from './date';
import { DEFAULT_COHORT_CAPACITY, type Cohort, type Todo } from './schema';

/**
 * 반 편성·주간 빌보드 (스펙 §2-4 · 기획서 v1.2 §14, D-006).
 *
 * 성적·등급은 **타입 차원에서** 들어올 수 없다(schema.ts 의 Sealed) — 이 파일은
 * 오직 '실행량'만 집계한다. 하위 순위는 반환하지 않고 본인에게는 상위 구간만 알린다.
 */

export type BoardCategory = 'completed' | 'streak' | 'recovery' | 'self_best';

export interface BoardEntry {
  anon_id: string;
  nickname: string;
  value: number;
}

export interface BoardSection {
  /** 상위 3명만. 하위 순위는 만들지 않는다. */
  top3: BoardEntry[];
  /** 본인 구간 — 순위 숫자 대신 '상위 N%' 구간만 준다. */
  me: { value: number; top_percent: number } | null;
}

export interface WeeklyBoard {
  week_start: ISODate;
  week_end: ISODate;
  /** 집계에 포함된 인원(휴면 제외). */
  participants: number;
  sections: Record<BoardCategory, BoardSection>;
}

export interface WeeklyBoardOptions {
  /** 본인 구간을 계산할 대상. */
  meAnonId?: string;
}

/** 그 날의 계획 분량·완료 분량. */
const totals = (todo: Todo) => {
  let planned = 0;
  let done = 0;
  for (const t of todo.tasks) {
    planned += t.qty;
    if (t.done) done += t.qty;
  }
  return { planned, done };
};

/** 학습일(계획 분량이 있는 날)이며 전량 완수했는가. */
const fullyDone = (todo: Todo | undefined): boolean => {
  if (!todo) return false;
  const { planned, done } = totals(todo);
  return planned > 0 && done >= planned;
};

const byDate = (todos: Todo[]): Map<ISODate, Todo> => {
  const m = new Map<ISODate, Todo>();
  for (const t of todos) {
    const cur = m.get(t.date);
    m.set(t.date, cur ? { ...cur, tasks: [...cur.tasks, ...t.tasks] } : t);
  }
  return m;
};

/** 주간 완료 분량. */
function completedIn(todos: Todo[], week: ISODate[]): number {
  const m = byDate(todos);
  return week.reduce((s, d) => s + (m.get(d) ? totals(m.get(d)!).done : 0), 0);
}

/** 주 안에서 연속으로 전량 완수한 학습일의 최대 길이. */
function streakIn(todos: Todo[], week: ISODate[]): number {
  const m = byDate(todos);
  let best = 0;
  let run = 0;
  for (const d of week) {
    const todo = m.get(d);
    if (!todo || totals(todo).planned === 0) continue; // 학습일이 아니면 연속을 끊지 않는다
    if (fullyDone(todo)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

/** 전일 미완 → 당일 전량 완수 발생 횟수. 주 첫날 판정을 위해 전날까지 본다. */
function recoveryIn(todos: Todo[], week: ISODate[]): number {
  const m = byDate(todos);
  let count = 0;
  for (const d of week) {
    const prev = m.get(addDays(d, -1));
    const prevPlanned = prev ? totals(prev).planned : 0;
    const prevMissed = prevPlanned > 0 && !fullyDone(prev);
    if (prevMissed && fullyDone(m.get(d))) count += 1;
  }
  return count;
}

/** 직전 4주 최고 주간 완료량 대비 증가율(%). 기준이 0이면 0으로 둔다(무한대 미노출). */
function selfBestIn(todos: Todo[], weekStart: ISODate): number {
  const thisWeek = completedIn(todos, weekDates(weekStart));
  let best = 0;
  for (let k = 1; k <= 4; k += 1) {
    best = Math.max(best, completedIn(todos, weekDates(addDays(weekStart, -7 * k))));
  }
  if (best === 0) return 0;
  return Math.round(((thisWeek - best) / best) * 100);
}

function section(
  values: { anon_id: string; nickname: string; value: number }[],
  meAnonId?: string,
): BoardSection {
  const ranked = [...values].sort((a, b) => b.value - a.value || a.anon_id.localeCompare(b.anon_id));
  const top3 = ranked.slice(0, 3).map(({ anon_id, nickname, value }) => ({ anon_id, nickname, value }));

  let me: BoardSection['me'] = null;
  if (meAnonId) {
    const idx = ranked.findIndex((r) => r.anon_id === meAnonId);
    if (idx >= 0) {
      // 순위 숫자 대신 10% 단위 상위 구간만 — 하위 순위를 드러내지 않는다.
      const top_percent = Math.min(100, Math.ceil(((idx + 1) / ranked.length) * 10) * 10);
      me = { value: ranked[idx].value, top_percent };
    }
  }
  return { top3, me };
}

/**
 * 주간 빌보드 — 월 00:00 ~ 일 24:00 창의 4부문 집계.
 * 휴면(dormant) 멤버는 제외한다. 저장하지 않고 매번 원장에서 산출한다(이중 장부 금지).
 */
export function weeklyBoard(
  cohort: Cohort,
  todosByMember: Record<string, Todo[]>,
  week: ISODate,
  opts: WeeklyBoardOptions = {},
): WeeklyBoard {
  const weekStart = mondayOf(week);
  const days = weekDates(weekStart);
  const active = cohort.members.filter((m) => !m.dormant);

  const rows = active.map((m) => {
    const todos = todosByMember[m.anon_id] ?? [];
    return {
      anon_id: m.anon_id,
      nickname: m.nickname,
      completed: completedIn(todos, days),
      streak: streakIn(todos, days),
      recovery: recoveryIn(todos, days),
      self_best: selfBestIn(todos, weekStart),
    };
  });

  const pick = (key: BoardCategory) =>
    section(
      rows.map((r) => ({ anon_id: r.anon_id, nickname: r.nickname, value: r[key] })),
      opts.meAnonId,
    );

  return {
    week_start: weekStart,
    week_end: addDays(weekStart, 6),
    participants: active.length,
    sections: {
      completed: pick('completed'),
      streak: pick('streak'),
      recovery: pick('recovery'),
      self_best: pick('self_best'),
    },
  };
}

/**
 * 반 편성 — 동일 band+season 중 정원 미달 반에 배정, 없으면 신설한다.
 * 순수 함수: 입력 배열을 변형하지 않으며, 멤버 추가는 호출측 책임이다.
 */
export function assignCohort(
  user: { band: string; season: string },
  cohorts: Cohort[],
  capacity: number = DEFAULT_COHORT_CAPACITY,
): Cohort {
  const sameBand = cohorts.filter((c) => c.band === user.band && c.season === user.season);
  const open = sameBand.find((c) => c.members.length < c.capacity);
  if (open) return open;

  return {
    id: `${user.band}-${user.season}-${sameBand.length + 1}`,
    band: user.band,
    season: user.season,
    capacity,
    members: [],
  };
}
