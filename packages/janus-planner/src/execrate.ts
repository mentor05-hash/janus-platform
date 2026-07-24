import { daysBetween, type ISODate } from './date';
import type { Todo } from './schema';

/**
 * 실행능력 계수 (스펙 §2-3 · 기획서 v1.2 §5-2) — 페이싱 가드의 쌍둥이.
 * 최근 실측 완수율로 계획을 재추정해 "이 목표는 12주가 아니라 N주가 필요합니다" 를 만든다.
 * 미완수를 비난하지 않고 재설계(기간 연장·시간 증량·범위 축소) 선택지로 잇는 것이 목적이다.
 */

export type ReplanOption = 'extend' | 'add_hours' | 'reduce_scope';

export type ExecStatus =
  /** 정상 산출. */
  | 'ok'
  /** 표본 7일 미만 — 계수를 내지 않는다. */
  | 'insufficient'
  /** 실행률 0 — needed_weeks 는 무한대이므로 수치 대신 상태로 표현한다. */
  | 'stalled';

export interface ExecRateOptions {
  today: ISODate;
  /** 실측 창(기본 28일). */
  windowDays?: number;
  /** 원래 계획 주수. 재추정의 기준값. */
  plannedWeeks?: number;
  /** 남은 분량. 생략하면 todos 의 미완 합. */
  remainingUnits?: number;
  /** 주당 계획 분량. 생략하면 remainingUnits / plannedWeeks. */
  plannedUnitsPerWeek?: number;
}

export interface ExecRateResult {
  /** 실측 완수율 0~1. 표본 부족이면 null. */
  rate: number | null;
  /** 현재 실행률로 목표를 마치는 데 필요한 주수. 산출 불가면 null. */
  needed_weeks: number | null;
  status: ExecStatus;
  /** 재설계 선택지 — 재추정이 계획을 넘어설 때만 제시한다. */
  options: ReplanOption[];
  /** 창 안에 실제로 존재한 원장 일수. */
  sampleDays: number;
}

const DEFAULT_WINDOW_DAYS = 28;
const MIN_SAMPLE_DAYS = 7;
const ALL_OPTIONS: ReplanOption[] = ['extend', 'add_hours', 'reduce_scope'];

/**
 * 실행률과 재추정 주수.
 *
 * `rate = Σ완료 qty / Σ계획 qty` (창 안),
 * `needed_weeks = ceil(remaining_units / (planned_units_per_week × rate))`.
 *
 * 예: 창 안 계획 100·완료 62 → rate 0.62. 12주 계획을 이 속도로 소화하면
 * `ceil(12 / 0.62) = 20`주가 필요하다(올림 — 미달 계획을 제시하지 않는다).
 */
export function execRate(todos: Todo[], opts: ExecRateOptions): ExecRateResult {
  const { today, windowDays = DEFAULT_WINDOW_DAYS, plannedWeeks } = opts;

  // 지난 windowDays 일 — 진행 중인 오늘은 제외한다(부분 완료가 실행률을 끌어내리므로).
  const window = todos.filter((t) => {
    const back = daysBetween(t.date, today);
    return back > 0 && back <= windowDays;
  });
  const sampleDays = window.length;

  let planned = 0;
  let done = 0;
  for (const todo of window) {
    for (const task of todo.tasks) {
      planned += task.qty;
      if (task.done) done += task.qty;
    }
  }

  if (sampleDays < MIN_SAMPLE_DAYS || planned === 0) {
    return { rate: null, needed_weeks: null, status: 'insufficient', options: [], sampleDays };
  }

  const rate = done / planned;
  if (rate === 0) {
    // 전량 미완 — needed_weeks 가 무한대라 수치로 내보내지 않고 상태로 알린다.
    return { rate: 0, needed_weeks: null, status: 'stalled', options: [...ALL_OPTIONS], sampleDays };
  }

  const remainingUnits =
    opts.remainingUnits ??
    todos.reduce((s, t) => s + t.tasks.reduce((k, x) => k + (x.done ? 0 : x.qty), 0), 0);

  const perWeek =
    opts.plannedUnitsPerWeek ??
    (plannedWeeks && plannedWeeks > 0 ? remainingUnits / plannedWeeks : 0);

  if (!perWeek || perWeek <= 0) {
    return { rate, needed_weeks: null, status: 'ok', options: [], sampleDays };
  }

  const needed_weeks = Math.ceil(remainingUnits / (perWeek * rate));
  const overrun = plannedWeeks ? needed_weeks > plannedWeeks : false;

  return {
    rate,
    needed_weeks,
    status: 'ok',
    options: overrun ? [...ALL_OPTIONS] : [],
    sampleDays,
  };
}
