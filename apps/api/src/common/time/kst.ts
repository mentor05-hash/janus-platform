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

/**
 * 특정 KST 날짜의 자정 기준 분(0..1440으로 클램프).
 * kstMinutesOfDay 는 24:00 을 0 으로 접어 인터벌이 깨지지만, 이 함수는 날짜 자정 기준
 * 상대값이라 24:00 종료=1440, 자정 교차(이전/다음날)는 [0,1440]으로 클램프해 안전.
 */
export function kstMinutesInDay(utc: Date, dateStr: string): number {
  const base = utcFromKst(dateStr, 0).getTime();
  const min = Math.round((utc.getTime() - base) / 60_000);
  return Math.max(0, Math.min(1440, min));
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
  const ms =
    Date.UTC(y, mo - 1, d) - KST_OFFSET_MIN * 60_000 + minutesOfDay * 60_000;
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
