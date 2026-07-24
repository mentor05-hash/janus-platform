import { describe, expect, it } from 'vitest';
import { addDays, dowOf, eachDate, isISODate, mondayOf, weekDates } from './date';
import {
  PlannerError,
  effectiveIntensity,
  isMinor,
  makeJourney,
  type AgeBand,
  type Journey,
} from './schema';

const journey = (age_band: AgeBand, guardian: boolean): Journey => ({
  user_id: 'u1',
  driver: 'self',
  age_band,
  goal: { type: 'exam', label: '2027 수능', d_day: '2027-11-18' },
  intensity: 2,
  consent: { guardian, notify_guardian: false },
});

describe('스펙 §3-10 — 미성년 보호자 동의', () => {
  it.each<AgeBand>(['elem', 'middle', 'high'])(
    '%s 는 보호자 동의 없이는 여정을 만들 수 없다',
    (band) => {
      expect(isMinor(band)).toBe(true);
      expect(() => makeJourney(journey(band, false))).toThrowError(PlannerError);
      try {
        makeJourney(journey(band, false));
      } catch (e) {
        expect((e as PlannerError).code).toBe('GUARDIAN_CONSENT_REQUIRED');
      }
    },
  );

  it('보호자 동의가 있으면 통과한다', () => {
    expect(makeJourney(journey('high', true)).age_band).toBe('high');
  });

  it('성인은 보호자 동의가 필요 없다', () => {
    expect(isMinor('adult')).toBe(false);
    expect(makeJourney(journey('adult', false)).age_band).toBe('adult');
  });
});

describe('동반 강도', () => {
  it('v1 엔진은 1~3만 쓰고, 4·5는 3으로 클램프한다(원본은 보존)', () => {
    const j: Journey = { ...journey('adult', false), intensity: 5 };
    expect(effectiveIntensity(j)).toBe(3);
    expect(j.intensity).toBe(5);
  });
});

describe('ISODate 달력 유틸', () => {
  it('실재하지 않는 날짜를 걸러낸다', () => {
    expect(isISODate('2026-08-03')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-8-3')).toBe(false);
  });

  it('요일·주 경계(월요일 시작)를 정확히 계산한다', () => {
    expect(dowOf('2026-08-03')).toBe(1); // 월
    expect(dowOf('2026-08-09')).toBe(0); // 일
    expect(mondayOf('2026-08-09')).toBe('2026-08-03'); // 일요일은 그 주에 속한다
    expect(mondayOf('2026-08-03')).toBe('2026-08-03');
    expect(weekDates('2026-08-06')).toEqual(eachDate('2026-08-03', '2026-08-09'));
  });

  it('월·연 경계를 넘어간다', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // 윤년
  });
});
