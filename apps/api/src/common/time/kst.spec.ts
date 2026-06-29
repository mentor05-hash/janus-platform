import { kstMinutesInDay, utcFromKst } from './kst';

/** 자정 경계/교차 처리(L1). */
describe('kstMinutesInDay', () => {
  const DATE = '2026-07-01';

  it('일중 시각 → 자정 기준 분', () => {
    expect(kstMinutesInDay(utcFromKst(DATE, 600), DATE)).toBe(600); // 10:00
    expect(kstMinutesInDay(utcFromKst(DATE, 550), DATE)).toBe(550); // 09:10
  });

  it('24:00(다음날 00:00) 종료는 1440 으로(0 으로 접히지 않음)', () => {
    expect(kstMinutesInDay(utcFromKst(DATE, 1440), DATE)).toBe(1440);
  });

  it('자정 교차는 [0,1440] 으로 클램프', () => {
    expect(kstMinutesInDay(utcFromKst(DATE, -60), DATE)).toBe(0); // 이전날 23:00 → 0
    expect(kstMinutesInDay(utcFromKst(DATE, 1500), DATE)).toBe(1440); // 다음날 01:00 → 1440
  });
});
