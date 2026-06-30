import { buildDaySlots, isRangeBookable, Interval } from './slots';

/**
 * §5-1 휴게 버퍼 불변규칙 (최우선).
 * 시드값 고정: work=stay=09:00–11:30, 예약 A=9:10–9:50 · B=10:30–11:20
 *   → 선택 가능 유일창 = 10:00–10:20 (슬롯 index 60,61).
 */
const H = (h: number, m = 0): number => h * 60 + m;

const SCENARIO = {
  work: [{ start: H(9), end: H(11, 30) }] as Interval[],
  stay: [{ start: H(9), end: H(11, 30) }] as Interval[],
  bookings: [
    { start: H(9, 10), end: H(9, 50) }, // A
    { start: H(10, 30), end: H(11, 20) }, // B
  ] as Interval[],
};

describe('휴게 버퍼(§5-1)', () => {
  it('유일한 가용창은 10:00–10:20 (index 60,61)', () => {
    const slots = buildDaySlots({
      ...SCENARIO,
      dayStartMin: H(9),
      dayEndMin: H(11, 30),
    });
    const availIdx = slots
      .filter((s) => s.status === 'avail')
      .map((s) => s.index);
    expect(availIdx).toEqual([60, 61]);
    expect(slots.find((s) => s.index === 60)?.time).toBe('10:00');
    expect(slots.find((s) => s.index === 61)?.time).toBe('10:10');
  });

  it('예약 양옆 10분은 rest 로 모델링된다', () => {
    const slots = buildDaySlots({
      ...SCENARIO,
      dayStartMin: H(9),
      dayEndMin: H(11, 30),
    });
    const byIdx = (i: number) => slots.find((s) => s.index === i)?.status;
    expect(byIdx(54)).toBe('rest'); // 09:00–09:10 (A 앞 버퍼)
    expect(byIdx(59)).toBe('rest'); // 09:50–10:00 (A 뒤 버퍼)
    expect(byIdx(62)).toBe('rest'); // 10:20–10:30 (B 앞 버퍼)
    expect(byIdx(68)).toBe('rest'); // 11:20–11:30 (B 뒤 버퍼)
  });

  it('예약 슬롯은 booked', () => {
    const slots = buildDaySlots({
      ...SCENARIO,
      dayStartMin: H(9),
      dayEndMin: H(11, 30),
    });
    const booked = slots
      .filter((s) => s.status === 'booked')
      .map((s) => s.index);
    expect(booked).toEqual([55, 56, 57, 58, 63, 64, 65, 66, 67]);
  });

  it('10:00–10:20 예약은 가능, 인접/겹침은 불가', () => {
    expect(isRangeBookable(SCENARIO, H(10), H(10, 20))).toBe(true); // 유일창 정확히
    expect(isRangeBookable(SCENARIO, H(10), H(10, 10))).toBe(true); // 10분 단위 일부도 가능
    expect(isRangeBookable(SCENARIO, H(10), H(10, 30))).toBe(false); // B 앞 버퍼 침범
    expect(isRangeBookable(SCENARIO, H(9, 50), H(10, 20))).toBe(false); // A 뒤 버퍼 침범
    expect(isRangeBookable(SCENARIO, H(10, 20), H(10, 40))).toBe(false); // B와 충돌
  });
});
