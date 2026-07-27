/**
 * ISODate('YYYY-MM-DD') 순수 달력 연산.
 *
 * 도메인은 **KST 달력일 문자열만** 다루고 시각·타임존을 들이지 않는다.
 * UTC↔KST 변환은 호출측(API 계층) 책임 — 레포에는 apps/api/src/common/time/kst.ts 가 있다.
 * 여기서 Date 는 '에폭 일수 ↔ 달력' 변환에만 쓰며 항상 UTC 기준이라 실행 환경 TZ와 무관하다.
 */

/** 'YYYY-MM-DD' — KST 달력 날짜. */
export type ISODate = string;

/** 요일: 0=일 … 6=토 (스펙 §1 dow 표기와 동일). */
export type Dow = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DAY_MS = 86_400_000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 형식·실재 날짜 여부(2026-02-30 같은 값은 false). */
export function isISODate(value: string): boolean {
  if (!ISO_RE.test(value)) return false;
  return toISODate(toDayNumber(value)) === value;
}

/** ISODate → 에폭 기준 일수. */
export function toDayNumber(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** 에폭 기준 일수 → ISODate. */
export function toISODate(dayNumber: number): ISODate {
  const d = new Date(dayNumber * DAY_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** n일 뒤(음수면 앞). */
export function addDays(date: ISODate, n: number): ISODate {
  return toISODate(toDayNumber(date) + n);
}

/** b − a (일). 같은 날이면 0. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return toDayNumber(b) - toDayNumber(a);
}

/** 요일(0=일 … 6=토). */
export function dowOf(date: ISODate): Dow {
  return (((toDayNumber(date) + 4) % 7) + 7) % 7 as Dow; // 1970-01-01 = 목(4)
}

/** [start, end] 양끝 포함 날짜 목록. start > end 면 빈 배열. */
export function eachDate(start: ISODate, end: ISODate): ISODate[] {
  const from = toDayNumber(start);
  const to = toDayNumber(end);
  const out: ISODate[] = [];
  for (let n = from; n <= to; n += 1) out.push(toISODate(n));
  return out;
}

/** 그 날이 속한 주의 월요일(빌보드 집계 창 §2-4: 월 00:00 ~ 일 24:00). */
export function mondayOf(date: ISODate): ISODate {
  const dow = dowOf(date);
  const backToMonday = (dow + 6) % 7; // 일(0) → 6, 월(1) → 0
  return addDays(date, -backToMonday);
}

/** 월요일 시작 7일. */
export function weekDates(anyDateInWeek: ISODate): ISODate[] {
  const monday = mondayOf(anyDateInWeek);
  return eachDate(monday, addDays(monday, 6));
}
