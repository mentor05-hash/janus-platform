import { describe, it, expect } from 'vitest';
import { slotToTime, isSameDay, inThisWeek } from './schedule';

describe('slotToTime — 10분 슬롯 인덱스 → HH:MM', () => {
  it('자정/정각/반시간 경계', () => {
    expect(slotToTime(0)).toBe('00:00');
    expect(slotToTime(54)).toBe('09:00'); // 540분
    expect(slotToTime(57)).toBe('09:30'); // 570분
    expect(slotToTime(143)).toBe('23:50');
  });
});

describe('isSameDay', () => {
  const ref = new Date('2026-07-02T10:00:00+09:00');
  it('같은 날/다른 날/널', () => {
    expect(isSameDay('2026-07-02T23:00:00+09:00', ref)).toBe(true);
    expect(isSameDay('2026-07-03T00:10:00+09:00', ref)).toBe(false);
    expect(isSameDay(null, ref)).toBe(false);
  });
});

describe('inThisWeek — 월~일 주간', () => {
  // 2026-07-02 는 목요일 → 이번 주 = 2026-06-29(월) ~ 07-05(일)
  const now = new Date('2026-07-02T12:00:00');
  it('주 시작(월)·끝(일) 포함, 이전 일요일·다음 월요일 제외', () => {
    expect(inThisWeek('2026-06-29T00:00:00', now)).toBe(true);  // 월
    expect(inThisWeek('2026-07-05T23:00:00', now)).toBe(true);  // 일
    expect(inThisWeek('2026-06-28T23:00:00', now)).toBe(false); // 지난 일
    expect(inThisWeek('2026-07-06T00:00:00', now)).toBe(false); // 다음 월
    expect(inThisWeek(null, now)).toBe(false);
  });
});
