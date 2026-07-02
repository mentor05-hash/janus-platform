/** 슬롯/일정 관련 순수 헬퍼(예약 화면 공통). 10분 슬롯 인덱스 = index*10분. */

/** 10분 슬롯 인덱스 → 'HH:MM' (00:00 기준). 예: 54 → '09:00', 57 → '09:30'. */
export function slotToTime(index: number): string {
  const total = index * 10;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** ISO 시각이 기준일(ref)과 같은 캘린더 날짜인가. */
export function isSameDay(iso: string | null, ref: Date): boolean {
  return !!iso && new Date(iso).toDateString() === ref.toDateString();
}

/** ISO 시각이 now 가 속한 주(월~일)에 포함되는가. */
export function inThisWeek(iso: string | null, now: Date = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 7);
  return d >= mon && d < sun;
}
