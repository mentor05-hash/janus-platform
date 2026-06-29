/**
 * KST(UTC+9, DST 없음) 시간 헬퍼 (CLAUDE.md §7: 저장 UTC · 표시 KST).
 * 슬롯 계산은 'KST 자정 기준 분(minutes-of-day)' 으로 수행.
 */
export const KST_OFFSET_MIN = 540;
const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC 시각 → 그 날(KST) 자정 기준 분. */
export function kstMinutesOfDay(utc: Date): number {
  const shifted = utc.getTime() + KST_OFFSET_MIN * 60_000;
  return Math.floor((((shifted % DAY_MS) + DAY_MS) % DAY_MS) / 60_000);
}

/** UTC 시각 → KST 달력 날짜 'YYYY-MM-DD'. */
export function kstDateString(utc: Date): string {
  const d = new Date(utc.getTime() + KST_OFFSET_MIN * 60_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** KST 달력 날짜 + 자정 기준 분 → UTC Date. */
export function utcFromKst(dateStr: string, minutesOfDay: number): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const ms = Date.UTC(y, mo - 1, d) - KST_OFFSET_MIN * 60_000 + minutesOfDay * 60_000;
  return new Date(ms);
}

/** KST 달력 날짜의 요일 (0=일 .. 6=토). */
export function weekdayKst(dateStr: string): number {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

/** "HH:MM" → 자정 기준 분. */
export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}
