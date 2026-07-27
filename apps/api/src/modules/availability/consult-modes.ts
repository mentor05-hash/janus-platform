import {
  intersectModes,
  slotModes,
  type SlotMode,
  type WeeklySlot,
  type Env,
} from '@mentoring/janus-planner';
import type { DayWindow } from './availability.service';

/**
 * 상담 모드 매칭 어댑터 — 플랫폼 가용시간(JSON) ↔ 플래너 availability 규약(O119③).
 *
 * 왜 어댑터인가: WebRTC 브리핑 §5-1-C 는 "availability 규약을 재사용하고 **새 스키마를 만들지 말 것**"이라 했는데,
 * 실제로는 두 규약이 비호환이었다 —
 *   · 플랫폼: `DayWindow { start, end }`(work_schedule.recurring_template · student_profile.stay_time, **JSON 컬럼**)
 *   · 플래너: `WeeklySlot { dow, start, end, env, modes? }`(순수 도메인, DB 없음)
 * O119③ 은 modes 를 **어디에 둘지**만 정했고 영속 경로는 정하지 않았다. 그 공백을 여기서 메운다:
 * JSON 컬럼이라 **마이그레이션 없이** DayWindow 에 `env`·`modes` 를 덧붙일 수 있고,
 * 교집합 산식은 **정본(intersectModes)을 호출**한다 — 여기서 다시 구현하면 두 곳이 갈라진다.
 *
 * 기존 데이터(env·modes 없는 창)는 `DEFAULT_ENV` 로 해석된다. 이때도 '전부 가능'으로 넓히지 않는 것이
 * 플래너 기본값 규약이다 — 예약 기대 불일치("음성인 줄 알았는데 채팅")를 만들지 않기 위해서다.
 */

/** env 미지정 창의 해석 — 가장 흔한 상황(집·독서실 어느 쪽인지 모름)에서 과하게 넓히지 않는다. */
const DEFAULT_ENV: Env = 'etc';

/** JSON 창 → 플래너 슬롯. dow 는 창 자체에 없으므로 호출측이 준다. */
export function toWeeklySlot(dow: number, w: DayWindow): WeeklySlot {
  return {
    dow: dow as WeeklySlot['dow'],
    start: w.start,
    end: w.end,
    env: (w.env as Env | undefined) ?? DEFAULT_ENV,
    modes: w.modes as readonly SlotMode[] | undefined,
  };
}

/** 한 창에서 가능한 모드(명시값 우선, 없으면 env 기본값). */
export function windowModes(dow: number, w: DayWindow): readonly SlotMode[] {
  return slotModes(toWeeklySlot(dow, w));
}

/**
 * 양측 창들의 **합집합이 아니라 교집합**을 낸다 — "이 시간대에 둘 다 가능한 상담 방식".
 *
 * 창이 여러 개면 창 쌍마다 교집합을 구해 합친다(서로 다른 시간대는 각자 다른 모드일 수 있다).
 * 결과가 비면 그 요일은 **상담 불가**이며, 예약 목록 생성 단계에서 걸러야 한다 —
 * 입장한 뒤에 "화상이 안 되네"를 알면 이미 늦다.
 */
export function pairModes(
  dow: number,
  teacherWindows: DayWindow[],
  studentWindows: DayWindow[],
): readonly SlotMode[] {
  const seen = new Set<SlotMode>();
  for (const t of teacherWindows) {
    for (const s of studentWindows) {
      for (const m of intersectModes(
        toWeeklySlot(dow, t),
        toWeeklySlot(dow, s),
      ))
        seen.add(m);
    }
  }
  // 정본(intersectModes)의 우선순위 정렬을 유지한다 — 첫 항목이 기본 제안이 되므로 순서가 의미를 갖는다.
  const RANK: readonly SlotMode[] = ['video', 'voice', 'whiteboard', 'chat'];
  return RANK.filter((m) => seen.has(m));
}

/** 학생 체류시간이 미설정이면 '제한 없음'이다(기존 규약) — 그 경우 선생님 쪽 모드를 그대로 쓴다. */
export function pairModesWithOpenStudent(
  dow: number,
  teacherWindows: DayWindow[],
  studentWindows: DayWindow[] | null,
): readonly SlotMode[] {
  if (!studentWindows) {
    const seen = new Set<SlotMode>();
    for (const t of teacherWindows)
      for (const m of windowModes(dow, t)) seen.add(m);
    const RANK: readonly SlotMode[] = ['video', 'voice', 'whiteboard', 'chat'];
    return RANK.filter((m) => seen.has(m));
  }
  return pairModes(dow, teacherWindows, studentWindows);
}

/**
 * 플랫폼 상담 모드(`consult_mode`) → 이 모드가 **성립하려면 반드시 필요한** 플래너 SlotMode.
 *
 * 두 축은 다른 것이다 — consult_mode 는 '무엇으로 상담하나'(상품·요금 축),
 * SlotMode 는 '그 시간대에 무엇이 가능한가'(환경 축). 그래서 매핑은 **1:1 이 아니라 필요조건**이다.
 *   · zoom(줌 화상) → video 없으면 불가
 *   · chat(실시간 채팅) → chat 없으면 불가
 *   · hand(필기 공유 = 공유 화이트보드로 풀이) → whiteboard 없으면 불가
 *   · offline(센터 대면) → **온라인 모드와 무관**하므로 걸러내지 않는다(null)
 *   · board(게시판 Q&A) → 상담 예약 모드가 아니다(null)
 * ⚠ 플래너의 `voice` 는 대응하는 consult_mode 가 아직 없다 — 교집합에 나와도 오늘은 예약할 수 없고
 *   '가능한 모드' 안내로만 쓴다. 상품·요금(pricing_policy)이 생기면 그때 매핑을 추가한다.
 */
export const REQUIRED_SLOT_MODE: Readonly<Record<string, SlotMode | null>> =
  Object.freeze({
    zoom: 'video',
    chat: 'chat',
    hand: 'whiteboard',
    offline: null,
    board: null,
  });

/**
 * 요청한 상담 모드가 그 시간대에 **불가능한가**.
 * 매핑이 없는 모드(offline·board·미지의 값)는 판단하지 않는다 — 모르는 것을 막으면 멀쩡한 예약이 사라진다.
 */
export function consultModeBlocked(
  consultMode: string | undefined,
  available: readonly SlotMode[],
): boolean {
  if (!consultMode) return false;
  const required = REQUIRED_SLOT_MODE[consultMode];
  if (!required) return false;
  return !available.includes(required);
}
