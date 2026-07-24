import { daysBetween, dowOf, eachDate, type ISODate } from './date';
import {
  PlannerError,
  type Availability,
  type Env,
  type PlanItem,
  type Period,
  type Todo,
  type UnitType,
} from './schema';

/**
 * 분배 엔진 (스펙 §2-1) — planItem 을 기간 내 학습일에 펼쳐 일 단위 원장(todo[])을 만든다.
 * 순수 함수: 같은 입력이면 항상 같은 출력. 저장·시각 조회를 하지 않는다.
 */

export type DistributeFlag =
  /** total_units < study_days — 격일 자동 압축 제안(§2-1 엣지). */
  | 'compress_suggest'
  /** 환경이 맞지 않아 건너뛴 학습일이 있음(예: transit 뿐인 날의 problem). */
  | 'env_deferred'
  /** 기간이 짧아 total_units 를 다 소진하지 못함(per_day 모드). */
  | 'period_too_short';

export interface DistributeResult {
  todos: Todo[];
  /** 마지막으로 분량이 배정된 날. 배정이 없으면 null. */
  expectedEndDate: ISODate | null;
  flags: DistributeFlag[];
}

/**
 * 환경 → 수용 가능한 분량 단위 (기본 매핑, 정책값화 전제).
 * transit 은 인강·암기만 — 이동 중에 문제풀이를 배정하지 않는다.
 * home 은 오답·정리 성격이라 page 를 앞에 둔다.
 */
export const ENV_ACCEPTS: Readonly<Record<Env, readonly UnitType[]>> = {
  transit: ['lecture'],
  study: ['problem', 'page', 'lecture'],
  academy: ['problem', 'page', 'lecture'],
  school: ['page', 'problem', 'lecture'],
  home: ['page', 'problem', 'lecture'],
  etc: ['lecture', 'page', 'problem'],
};

/** 그 날 쓸 수 있는 환경들 — 주간 슬롯 + 그 날짜의 add 예외 슬롯. */
function envsOn(date: ISODate, availability: Availability): Env[] {
  const dow = dowOf(date);
  const weekly = availability.weekly_slots.filter((s) => s.dow === dow).map((s) => s.env);
  const added = availability.exceptions
    .filter((e) => e.date === date && e.delta === 'add')
    .flatMap((e) => e.slots ?? [])
    .map((s) => s.env);
  return [...weekly, ...added];
}

/**
 * 그 날에 이 분량 단위를 배정해도 되는지.
 * 환경 정보가 아예 없는 날은 **제약 없음**으로 본다 — weekly_slots 는 배정 힌트이지
 * 학습일 자체를 정하는 근거가 아니다(학습일은 study_pattern·exceptions 로만 정해진다).
 */
function dayAccepts(date: ISODate, item: PlanItem, availability: Availability): boolean {
  const envs = envsOn(date, availability);
  if (!envs.length) return true;
  if (item.env_pref?.length) return envs.some((e) => item.env_pref!.includes(e));
  return envs.some((e) => ENV_ACCEPTS[e].includes(item.unit_type));
}

/** study_pattern 이 그 날을 학습일로 삼는지(예외 반영 전). */
function matchesPattern(date: ISODate, item: PlanItem, periodStart: ISODate): boolean {
  const dow = dowOf(date);
  switch (item.study_pattern) {
    case 'daily':
      return true;
    case 'alt':
      // 격일 — 기간 시작일부터 이틀 간격.
      return daysBetween(periodStart, date) % 2 === 0;
    case 'no_weekend':
      return dow >= 1 && dow <= 5;
    case 'custom':
      return (item.custom_days ?? []).includes(dow);
  }
}

/** 기간 내 학습일 목록 — 패턴 적용 후 exceptions(off/add) 반영. */
export function studyDaysOf(item: PlanItem, availability: Availability, period: Period): ISODate[] {
  const off = new Set(
    availability.exceptions.filter((e) => e.delta === 'off').map((e) => e.date),
  );
  const days = new Set(
    eachDate(period.start, period.end).filter(
      (d) => matchesPattern(d, item, period.start) && !off.has(d),
    ),
  );
  for (const e of availability.exceptions) {
    if (e.delta !== 'add' || off.has(e.date)) continue;
    if (daysBetween(period.start, e.date) < 0 || daysBetween(e.date, period.end) < 0) continue;
    days.add(e.date);
  }
  return [...days].sort();
}

/** '1~3강' / '4~13p' / '1~3번' — 누적 분량을 사람이 읽는 라벨로. */
function unitLabel(from: number, qty: number, unit: UnitType): string {
  const to = from + qty - 1;
  const suffix = unit === 'lecture' ? '강' : unit === 'page' ? 'p' : '번';
  return from === to ? `${from}${suffix}` : `${from}~${to}${suffix}`;
}

/**
 * planItem 을 학습일에 분배한다.
 *
 * - `per_day`: 매 학습일에 per_day 개, total 소진 시 종료 → expectedEndDate 반환.
 * - `d_day`:   units_per_day = ceil(total / 학습일수), 마지막 날 잔여 조정.
 *
 * @throws PlannerError('EMPTY_PLAN') 학습일이 0일 때(빈 계획 금지).
 */
export function distribute(
  item: PlanItem,
  availability: Availability,
  period: Period,
  opts: { planId?: string } = {},
): DistributeResult {
  if (daysBetween(period.start, period.end) < 0) {
    throw new PlannerError('INVALID_PERIOD', 'period.end 가 period.start 보다 앞섭니다.');
  }
  if (!Number.isFinite(item.total_units) || item.total_units <= 0) {
    throw new PlannerError('INVALID_PLAN_ITEM', 'total_units 는 1 이상이어야 합니다.');
  }

  const allDays = studyDaysOf(item, availability, period);
  if (!allDays.length) {
    throw new PlannerError('EMPTY_PLAN', '기간 내 학습일이 없습니다 — 빈 계획은 만들지 않습니다.');
  }

  const days = allDays.filter((d) => dayAccepts(d, item, availability));
  if (!days.length) {
    throw new PlannerError(
      'EMPTY_PLAN',
      `학습일은 있으나 ${item.unit_type} 을 배정할 수 있는 환경의 날이 없습니다.`,
    );
  }

  const flags: DistributeFlag[] = [];
  if (days.length < allDays.length) flags.push('env_deferred');
  if (item.total_units < allDays.length) flags.push('compress_suggest');

  const perDay =
    item.split_mode === 'per_day'
      ? Math.max(1, Math.floor(item.per_day ?? 1))
      : Math.ceil(item.total_units / days.length);

  const todos: Todo[] = [];
  let remaining = item.total_units;
  let cursor = 1; // 누적 진도(1-base) — unit_label 계산용
  let expectedEndDate: ISODate | null = null;

  for (const date of days) {
    if (remaining <= 0) break;
    const qty = Math.min(perDay, remaining);
    todos.push({
      plan_id: opts.planId ?? '',
      date,
      tasks: [
        {
          content_ref: item.content_ref,
          unit_label: unitLabel(cursor, qty, item.unit_type),
          qty,
          done: false,
        },
      ],
      locked: false,
    });
    remaining -= qty;
    cursor += qty;
    expectedEndDate = date;
  }

  if (remaining > 0) flags.push('period_too_short');

  return { todos, expectedEndDate, flags };
}

/** 배정 결과의 마지막 날이 기간 시작 기준 며칠째인지(1-base). 테스트·표시용. */
export function dayIndexInPeriod(period: Period, date: ISODate): number {
  return daysBetween(period.start, date) + 1;
}
