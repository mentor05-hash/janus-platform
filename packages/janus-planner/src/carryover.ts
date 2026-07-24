import { addDays, daysBetween, type ISODate } from './date';
import type { Todo, TodoTask } from './schema';

/**
 * 이월 엔진 (스펙 §2-2 · 기획서 v1.2 §5-1) — 미완수를 혼내지 않고 재배치한다.
 * 사용자 옵션 2택:
 *   - keep_deadline(기간 사수): 미완 분량을 잔여 학습일에 가중 재분배. 단 욱여넣기 금지.
 *   - keep_pace(강도 사수):    실측 평균 실행량으로 완료 예정일을 다시 계산.
 */

export type CarryMode = 'keep_deadline' | 'keep_pace';

export type CarryFlag =
  /** 일일 상한 초과로 재분배하지 않음 — 기간 연장을 제안한다. */
  | 'extend'
  /** 잔여 학습일이 없음. */
  | 'no_remaining_days'
  /** 표본 7일 미만이라 실측 대신 계획량으로 평균을 대체했다. */
  | 'planned_fallback';

export interface CarryProposalEntry {
  date: ISODate;
  /** 이 날에 더 얹으려는 분량. */
  add: number;
}

export interface CarryContext {
  today: ISODate;
  /** keep_pace 실측 창(기본 28일). */
  windowDays?: number;
}

export interface CarryResult {
  mode: CarryMode;
  /** 재분배가 적용된 원장. 적용하지 않은 경우 입력과 동일한 내용이다. */
  todos: Todo[];
  /** 재분배를 실제로 반영했는지. */
  applied: boolean;
  /** 계산된 재분배안 — 적용 여부와 무관하게 항상 돌려준다(상담·안내 화면용). */
  proposal: CarryProposalEntry[];
  /** 이월 대상 총 분량. */
  carriedUnits: number;
  /** 기존 최대 배정량 × 1.5. keep_pace 모드에서는 null. */
  dailyCap: number | null;
  /** keep_pace 모드의 재계산 완료 예정일. */
  projectedEndDate: ISODate | null;
  /** keep_pace 산식에 쓰인 일 평균 실행량. */
  avgDailyDone: number | null;
  flags: CarryFlag[];
}

const DEFAULT_WINDOW_DAYS = 28;
const MIN_SAMPLE_DAYS = 7;
/** 욱여넣기 금지 — 기존 최대 배정량의 1.5배를 넘기지 않는다. */
const CAP_RATIO = 1.5;

const cloneTodos = (todos: Todo[]): Todo[] =>
  todos.map((t) => ({ ...t, tasks: t.tasks.map((k) => ({ ...k })) }));

const dayTotal = (todo: Todo): number => todo.tasks.reduce((s, t) => s + t.qty, 0);
const undoneOf = (todo: Todo): number =>
  todo.tasks.reduce((s, t) => s + (t.done ? 0 : t.qty), 0);

/**
 * 최대잔여법 가중 배분 — 잔여일의 기존 배정량에 비례해 나누고,
 * 소수부가 큰 날(동률이면 앞 날짜)부터 1씩 더해 총합을 정확히 맞춘다.
 */
function weightedSplit(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (!n || total <= 0) return new Array(n).fill(0);
  const sum = weights.reduce((s, w) => s + w, 0);
  const w = sum > 0 ? weights : new Array(n).fill(1);
  const wSum = sum > 0 ? sum : n;

  const shares = w.map((x) => (total * x) / wSum);
  const out = shares.map((s) => Math.floor(s));
  let rest = total - out.reduce((s, x) => s + x, 0);

  const order = shares
    .map((s, i) => ({ i, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest > 0; k += 1, rest -= 1) out[order[k % n].i] += 1;
  return out;
}

/** 미완 task 를 날짜순 큐로 — 이월 시 FIFO 로 소비한다. */
function overdueQueue(overdue: Todo[]): { src: ISODate; origin: ISODate; task: TodoTask }[] {
  const q: { src: ISODate; origin: ISODate; task: TodoTask }[] = [];
  for (const todo of overdue) {
    for (const task of todo.tasks) {
      if (!task.done && task.qty > 0) {
        q.push({ src: todo.date, origin: task.carried_from ?? todo.date, task });
      }
    }
  }
  return q;
}

export function carryOver(todos: Todo[], mode: CarryMode, ctx: CarryContext): CarryResult {
  const { today } = ctx;
  const sorted = cloneTodos(todos).sort((a, b) => a.date.localeCompare(b.date));
  const overdue = sorted.filter((t) => t.date < today);
  const remainingDays = sorted.filter((t) => t.date >= today);
  const carriedUnits = overdue.reduce((s, t) => s + undoneOf(t), 0);

  if (mode === 'keep_pace') {
    return keepPace(sorted, ctx, carriedUnits);
  }

  const flags: CarryFlag[] = [];
  const peak = sorted.reduce((m, t) => Math.max(m, dayTotal(t)), 0);
  const dailyCap = peak * CAP_RATIO;

  if (carriedUnits === 0) {
    return {
      mode, todos: sorted, applied: true, proposal: [], carriedUnits,
      dailyCap, projectedEndDate: null, avgDailyDone: null, flags,
    };
  }
  if (!remainingDays.length) {
    return {
      mode, todos: sorted, applied: false, proposal: [], carriedUnits,
      dailyCap, projectedEndDate: null, avgDailyDone: null,
      flags: ['no_remaining_days', 'extend'],
    };
  }

  const add = weightedSplit(carriedUnits, remainingDays.map(dayTotal));
  const proposal: CarryProposalEntry[] = remainingDays.map((t, i) => ({ date: t.date, add: add[i] }));

  // 욱여넣기 금지 — 한 날이라도 상한을 넘으면 재분배하지 않고 기간 연장을 제안한다.
  const overCap = remainingDays.some((t, i) => dayTotal(t) + add[i] > dailyCap);
  if (overCap) {
    return {
      mode, todos: sorted, applied: false, proposal, carriedUnits,
      dailyCap, projectedEndDate: null, avgDailyDone: null, flags: ['extend'],
    };
  }

  // 적용 — 미완 task 를 큐에서 꺼내 잔여일로 옮긴다(원장은 하나, 이중 계상 없음).
  const queue = overdueQueue(overdue);
  let qi = 0;
  for (let i = 0; i < remainingDays.length; i += 1) {
    let need = add[i];
    while (need > 0 && qi < queue.length) {
      const head = queue[qi];
      const take = Math.min(need, head.task.qty);
      remainingDays[i].tasks.push({
        content_ref: head.task.content_ref,
        unit_label: head.task.unit_label,
        qty: take,
        done: false,
        carried_from: head.origin,
      });
      head.task.qty -= take;
      need -= take;
      if (head.task.qty === 0) qi += 1;
    }
  }
  // 옮겨간 만큼 과거 원장에서 비운다.
  for (const todo of overdue) todo.tasks = todo.tasks.filter((t) => t.done || t.qty > 0);

  return {
    mode, todos: sorted, applied: true, proposal, carriedUnits,
    dailyCap, projectedEndDate: null, avgDailyDone: null, flags,
  };
}

/** 강도 사수 — 최근 실측 평균으로 완료 예정일만 다시 계산한다(원장은 그대로). */
function keepPace(todos: Todo[], ctx: CarryContext, carriedUnits: number): CarryResult {
  const { today, windowDays = DEFAULT_WINDOW_DAYS } = ctx;
  const flags: CarryFlag[] = [];

  const window = todos.filter((t) => {
    const back = daysBetween(t.date, today);
    return back > 0 && back <= windowDays;
  });

  const sampleDays = window.length;
  const doneUnits = window.reduce(
    (s, t) => s + t.tasks.reduce((k, task) => k + (task.done ? task.qty : 0), 0),
    0,
  );

  let avgDailyDone: number | null = null;
  if (sampleDays >= MIN_SAMPLE_DAYS) {
    avgDailyDone = doneUnits / sampleDays;
  } else {
    // 표본 부족 — 실측 대신 계획량으로 대체한다.
    flags.push('planned_fallback');
    const planned = todos.reduce((s, t) => s + dayTotal(t), 0);
    avgDailyDone = todos.length ? planned / todos.length : null;
  }

  const remaining = todos.reduce((s, t) => s + undoneOf(t), 0);
  const projectedEndDate =
    avgDailyDone && avgDailyDone > 0 ? addDays(today, Math.ceil(remaining / avgDailyDone)) : null;

  return {
    mode: 'keep_pace',
    todos,
    applied: true,
    proposal: [],
    carriedUnits,
    dailyCap: null,
    projectedEndDate,
    avgDailyDone,
    flags,
  };
}
