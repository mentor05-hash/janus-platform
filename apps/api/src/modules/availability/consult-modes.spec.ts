import {
  pairModes,
  pairModesWithOpenStudent,
  windowModes,
} from './consult-modes';
import type { DayWindow } from './availability.service';

/**
 * 상담 모드 매칭(O119③) — 플랫폼 JSON 창 ↔ 플래너 규약 어댑터.
 * 교집합 산식 자체는 플래너 정본이 테스트한다. 여기서는 **어댑터 계약**을 고정한다:
 * 기존 데이터(모드 없는 창) 해석 · 다중 창 · 학생 미설정 · 공집합.
 */
const w = (
  start: string,
  end: string,
  env?: string,
  modes?: string[],
): DayWindow => ({ start, end, env, modes });

describe('상담 모드 교집합 어댑터', () => {
  it('모드 미지정 창(기존 데이터)은 전부 가능으로 넓히지 않는다', () => {
    // env 도 없으면 가장 좁은 해석(etc → chat) — 넓게 잡으면 "음성인 줄 알았는데 채팅" 사고가 난다.
    expect(windowModes(1, w('19:00', '21:00'))).toEqual(['chat']);
  });

  it('env 만 있으면 그 환경의 기본 모드로 해석한다', () => {
    expect(windowModes(1, w('19:00', '21:00', 'study'))).toEqual([
      'chat',
      'whiteboard',
    ]);
    expect(windowModes(1, w('19:00', '21:00', 'home'))).toContain('video');
  });

  it('명시 modes 가 env 기본값을 덮는다', () => {
    expect(
      windowModes(1, w('19:00', '21:00', 'study', ['voice', 'chat'])),
    ).toEqual(['voice', 'chat']);
  });

  it('학생 독서실 × 선생님 카페 → 채팅+화이트보드로 좁혀진다(브리핑 §5-1-C 예시)', () => {
    const teacher = [w('19:00', '22:00', 'academy')]; // voice·chat·whiteboard
    const student = [w('19:00', '21:00', 'study')]; // chat·whiteboard
    expect(pairModes(1, teacher, student)).toEqual(['whiteboard', 'chat']);
  });

  it('교집합이 비면 상담 불가 — 예약 단계에서 걸러야 한다', () => {
    const teacher = [w('19:00', '22:00', 'home', ['video'])];
    const student = [w('19:00', '21:00', 'study', ['chat'])];
    expect(pairModes(1, teacher, student)).toEqual([]);
  });

  it('창이 여러 개면 창 쌍마다의 교집합을 합친다(시간대마다 환경이 다르다)', () => {
    const teacher = [
      w('09:00', '12:00', 'transit'),
      w('19:00', '22:00', 'home'),
    ];
    const student = [
      w('09:00', '12:00', 'transit'),
      w('19:00', '21:00', 'home'),
    ];
    const r = pairModes(1, teacher, student);
    expect(r).toContain('video'); // 저녁(집×집)
    expect(r).toContain('voice'); // 아침(이동×이동)
    // 우선순위 정렬 유지 — 첫 항목이 기본 제안이 되므로 순서가 의미를 갖는다.
    expect(r.indexOf('video')).toBeLessThan(r.indexOf('chat'));
  });

  it('학생 체류시간 미설정(제한 없음)이면 선생님 쪽 모드를 그대로 쓴다(기존 규약 보존)', () => {
    const teacher = [w('19:00', '22:00', 'home')];
    expect(pairModesWithOpenStudent(1, teacher, null)).toContain('video');
    // 설정돼 있으면 교집합으로 좁아진다.
    expect(
      pairModesWithOpenStudent(1, teacher, [w('19:00', '21:00', 'study')]),
    ).toEqual(['whiteboard', 'chat']);
  });
});
