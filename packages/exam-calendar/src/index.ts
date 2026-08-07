/**
 * @mentoring/exam-calendar — 입시 캘린더 정적 모듈 (A7)
 *
 * 왜 정적인가: 모평·수능·원서 일정은 연 1~2회만 갱신되는 데이터다. 서버 왕복 없이
 * 상수로 내장하면 정적 티어 빌드(무료판 HTML)·웹·모바일이 같은 값을 즉시 쓴다.
 *
 * 단일 소스는 `src/events.json` 이고, `src/events.generated.ts` 는 거기서 생성된다
 * (`npm run gen:calendar` · CI 는 `--check`). 파이썬 티어 빌드는 JSON 을 직접 읽는다 —
 * 날짜를 두 곳에 적지 않기 위한 구조다.
 *
 * 날짜 규약: 모든 일정은 **KST 달력 날짜**(YYYY-MM-DD, 시각 없음)다. D-day 계산도 KST
 * 자정 기준으로 한다(UTC 저장/KST 표시 규약의 '종일 이벤트' 케이스).
 */
import { CALENDAR } from './events.generated';

export type ExamEventKind = 'edu_mock' | 'kice_mock' | 'suneung' | 'apply' | 'result';

/** 공고 대조 여부. provisional = 관례 기반 잠정(화면에 '잠정' 표기 필요). */
export type ExamEventStatus = 'confirmed' | 'provisional';

export interface ExamEvent {
  id: string;
  kind: ExamEventKind;
  /** 정식 명칭 */
  title: string;
  /** 배지·칩용 짧은 이름 */
  short: string;
  /** KST 달력 날짜 YYYY-MM-DD */
  start: string;
  /** 기간 이벤트의 마지막 날(포함). 단일일 이벤트는 null */
  end: string | null;
  status: ExamEventStatus;
  /** 근거(공고 링크 또는 관례 설명) */
  source: string;
}

export interface ExamCalendar {
  schema: number;
  cycle: string;
  timezone: string;
  /** 공고 대조 근거(미대조면 null) */
  verified_against: string | null;
  verified_at: string | null;
  events: ExamEvent[];
}

export type EventState = 'upcoming' | 'ongoing' | 'past';

export { CALENDAR };

/** 이 사이클의 전체 일정(시작일 오름차순). */
export const EXAM_EVENTS: ExamEvent[] = CALENDAR.events;

const MS_PER_DAY = 86_400_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' → UTC 자정 epoch(ms). 달력 날짜 비교 전용. */
function ymdToUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** 지금(기본 현재시각) 기준 KST 달력 날짜 'YYYY-MM-DD'. */
export function kstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 두 달력 날짜 사이 일수(to - from). 시간대·서머타임 영향 없음. */
export function diffDays(fromYmd: string, toYmd: string): number {
  return Math.round((ymdToUtcMs(toYmd) - ymdToUtcMs(fromYmd)) / MS_PER_DAY);
}

/** 오늘(KST)로부터 남은 일수. 오늘이면 0, 지났으면 음수. */
export function dDay(ymd: string, now: Date = new Date()): number {
  return diffDays(kstToday(now), ymd);
}

/** 이벤트의 진행 상태와 D-day(기간 이벤트는 시작일 기준). */
export function eventState(ev: ExamEvent, now: Date = new Date()): { state: EventState; dday: number } {
  const today = kstToday(now);
  const toStart = diffDays(today, ev.start);
  const toEnd = diffDays(today, ev.end ?? ev.start);
  if (toStart > 0) return { state: 'upcoming', dday: toStart };
  if (toEnd >= 0) return { state: 'ongoing', dday: toStart };
  return { state: 'past', dday: toStart };
}

/**
 * 다음 이벤트 — 진행 중인 이벤트가 있으면 그것, 없으면 가장 가까운 미래 이벤트.
 * 남은 일정이 없으면 null(사이클 종료 → 캘린더 갱신 신호).
 */
export function nextEvent(now: Date = new Date(), events: ExamEvent[] = EXAM_EVENTS): ExamEvent | null {
  const live = events
    .map((ev) => ({ ev, ...eventState(ev, now) }))
    .filter((x) => x.state !== 'past')
    .sort((a, b) => a.dday - b.dday || ymdToUtcMs(a.ev.start) - ymdToUtcMs(b.ev.start));
  const ongoing = live.find((x) => x.state === 'ongoing');
  return (ongoing ?? live[0])?.ev ?? null;
}

/** 다가오는 일정 최대 limit 개(진행 중 포함, 가까운 순). */
export function upcoming(limit = 3, now: Date = new Date(), events: ExamEvent[] = EXAM_EVENTS): ExamEvent[] {
  return events
    .filter((ev) => eventState(ev, now).state !== 'past')
    .sort((a, b) => ymdToUtcMs(a.start) - ymdToUtcMs(b.start))
    .slice(0, limit);
}

/** 표시용 문자열 — 'D-104' · 'D-DAY' · '진행 중' · 'D+3'. */
export function formatDday(ev: ExamEvent, now: Date = new Date()): string {
  const { state, dday } = eventState(ev, now);
  if (state === 'ongoing') return dday === 0 ? 'D-DAY' : '진행 중';
  if (dday === 0) return 'D-DAY';
  return dday > 0 ? `D-${dday}` : `D+${-dday}`;
}
