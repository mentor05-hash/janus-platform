/**
 * 슬롯 가용성 도메인 (CLAUDE.md §5-1 — 최우선 불변규칙).
 *
 * 규칙:
 *  - 하루를 10분 단위 슬롯으로 분할. 슬롯 i = [i*slotMin, i*slotMin+slotMin) 분(자정 기준).
 *  - 모든 예약 앞뒤 각 10분은 '휴게(rest)' — 다른 세션이 들어올 수 없음.
 *  - 유효(avail) = 선생님 근무 ∩ 학생 체류 − 예약(booked) − 버퍼(rest) − 차단(blocked).
 *  - 새 예약은 [start,end) 의 모든 슬롯이 avail 이어야 가능. (옆 예약의 버퍼가 rest 로
 *    이미 막혀 있으므로, 이 조건만으로 새 예약의 앞뒤 10분 분리도 자동 보장된다.)
 *
 * 시드 테스트(반드시 통과): work=stay=09:00–11:30, 예약 A=9:10–9:50·B=10:30–11:20
 *   → avail 슬롯은 index 60,61 (=10:00–10:20) 뿐.
 */

export interface Interval {
  /** 자정 기준 분(포함). */
  start: number;
  /** 자정 기준 분(미포함). */
  end: number;
}

export type SlotStatus = 'avail' | 'booked' | 'rest' | 'off' | 'blocked';

export interface Slot {
  index: number;
  time: string; // "HH:MM"
  status: SlotStatus;
}

export interface BuildSlotsInput {
  work: Interval[];
  stay: Interval[];
  bookings: Interval[];
  blocked?: Interval[];
  bufferMin?: number; // 기본 10
  slotMin?: number; // 기본 10
  dayStartMin?: number; // 기본 0
  dayEndMin?: number; // 기본 1440
}

const overlaps = (a: Interval, s: number, e: number) => a.start < e && s < a.end;
const within = (ivs: Interval[], s: number, e: number) =>
  ivs.some((iv) => iv.start <= s && e <= iv.end);

function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 예약 앞뒤 buffer 구간을 휴게 인터벌로 변환. */
export function bufferZones(bookings: Interval[], bufferMin: number): Interval[] {
  return bookings.flatMap((b) => [
    { start: b.start - bufferMin, end: b.start },
    { start: b.end, end: b.end + bufferMin },
  ]);
}

export function buildDaySlots(input: BuildSlotsInput): Slot[] {
  const {
    work,
    stay,
    bookings,
    blocked = [],
    bufferMin = 10,
    slotMin = 10,
    dayStartMin = 0,
    dayEndMin = 1440,
  } = input;

  const buffers = bufferZones(bookings, bufferMin);
  const slots: Slot[] = [];

  for (let s = dayStartMin; s < dayEndMin; s += slotMin) {
    const e = s + slotMin;
    const index = Math.floor(s / slotMin);
    let status: SlotStatus;

    if (bookings.some((b) => overlaps(b, s, e))) {
      status = 'booked';
    } else if (buffers.some((b) => overlaps(b, s, e))) {
      status = 'rest';
    } else if (!within(work, s, e) || !within(stay, s, e)) {
      status = 'off';
    } else if (blocked.some((b) => overlaps(b, s, e))) {
      status = 'blocked';
    } else {
      status = 'avail';
    }
    slots.push({ index, time: fmt(s), status });
  }
  return slots;
}

/**
 * 새 예약 [startMin, endMin) 이 가능한지 검증 (§5-1).
 * 해당 범위의 모든 슬롯이 avail 이어야 true.
 */
export function isRangeBookable(input: BuildSlotsInput, startMin: number, endMin: number): boolean {
  if (endMin <= startMin) return false;
  const slots = buildDaySlots({ ...input, dayStartMin: startMin, dayEndMin: endMin });
  return slots.length > 0 && slots.every((s) => s.status === 'avail');
}
