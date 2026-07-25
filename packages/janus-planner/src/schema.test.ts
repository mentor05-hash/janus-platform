import { describe, expect, it } from 'vitest';
import { addDays, dowOf, eachDate, isISODate, mondayOf, weekDates } from './date';
import { PlannerError, effectiveIntensity, isMinor, makeJourney, type AgeBand, type Journey, DEFAULT_MODES_BY_ENV, slotModes, intersectModes } from './schema';

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

/**
 * 상담 모드 매칭 — availability 규약 재사용(WebRTC 브리핑 §5-1-C).
 * 상담용 별도 스키마를 만들지 않고 플래너 슬롯에 modes 를 붙인 것이 정본 결정이다.
 */
describe('availability 슬롯 모드', () => {
  const slot = (env: Parameters<typeof slotModes>[0]['env'], modes?: Parameters<typeof slotModes>[0]['modes']) =>
    ({ dow: 1 as const, start: '19:00', end: '21:00', env, modes });

  it('명시 modes 가 없으면 env 기본값으로 해석한다', () => {
    expect(slotModes(slot('study'))).toEqual(DEFAULT_MODES_BY_ENV.study);
    expect(slotModes(slot('home'))).toEqual(DEFAULT_MODES_BY_ENV.home);
  });

  it('없다고 해서 전부 가능으로 넓히지 않는다 — 기본값은 보수적이다', () => {
    // 독서실(study)은 소리 불가 → video·voice 가 기본값에 없어야 한다.
    expect(slotModes(slot('study'))).not.toContain('video');
    expect(slotModes(slot('study'))).not.toContain('voice');
    // 이동 중(transit)은 판서 불가.
    expect(slotModes(slot('transit'))).not.toContain('whiteboard');
    // 알 수 없으면(etc) 가장 좁게.
    expect(slotModes(slot('etc'))).toEqual(['chat']);
  });

  it('빈 배열은 "명시적으로 없음"으로 존중한다(기본값으로 되돌리지 않는다)', () => {
    expect(slotModes(slot('home', []))).toEqual([]);
  });

  it('명시 modes 가 env 기본값을 덮는다', () => {
    // 독서실이지만 통화 부스가 있어 음성 가능하다고 본인이 지정한 경우.
    expect(slotModes(slot('study', ['voice', 'chat']))).toEqual(['voice', 'chat']);
  });

  it('교집합: 학생 독서실(chat+wb) × 멘토 카페(voice+chat+wb) → 채팅+화이트보드', () => {
    const student = slot('study'); // chat, whiteboard
    const mentor = slot('academy'); // voice, chat, whiteboard
    // 우선순위 정렬(풍부한 쪽 우선) — 첫 항목을 기본 제안으로 쓸 수 있어야 한다.
    expect(intersectModes(student, mentor)).toEqual(['whiteboard', 'chat']);
  });

  it('교집합이 비면 그 시간대는 상담 불가 — 예약 단계에서 걸러야 한다', () => {
    const a = slot('home', ['video']);
    const b = slot('study', ['chat']);
    expect(intersectModes(a, b)).toEqual([]);
  });

  it('교집합은 순서와 무관하다(양측 대칭)', () => {
    const a = slot('home');    // video·voice·chat·whiteboard
    const b = slot('transit'); // voice·chat
    expect(intersectModes(a, b)).toEqual(intersectModes(b, a));
    expect(intersectModes(a, b)).toEqual(['voice', 'chat']);
  });
});
