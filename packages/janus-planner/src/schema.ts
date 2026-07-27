import type { Dow, ISODate } from './date';

/* ────────────────────────────────────────────────────────────────────────
 * 금지 사항 — 스키마 레벨 강제 (스펙 §0)
 *
 * 주석이 아니라 컴파일러로 막는다. `?: never` 는 객체 리터럴의 초과 속성 검사뿐
 * 아니라 넓은 타입 변수를 경유한 주입까지 거부하므로, 아래 키들은 이 도메인의
 * 어떤 엔티티에도 **들어올 수 없다**.
 *  - D-006: 성적·등급·배치표 결과를 cohort·빌보드 어디에도 두지 않는다.
 *  - D-004: 경제 동결 — 보상은 배지 코드 문자열까지만, 크레딧·금액 필드 금지.
 * 실명·연락처는 도메인 밖(계정 모듈 소관) — cohort 멤버는 anon_id+nickname 만.
 * ──────────────────────────────────────────────────────────────────────── */

/** D-006 — 성적·등급·배치표 결과. */
type BannedScoreKey =
  | 'score' | 'scores' | 'grade' | 'grades' | 'rank' | 'ranking'
  | 'percentile' | 'placement' | 'gpa'
  | '성적' | '등급' | '누백' | '배치';

/** D-004 — 크레딧·보상액. */
type BannedRewardKey =
  | 'credit' | 'credits' | 'point' | 'points' | 'cash'
  | 'reward_amount' | 'payout'
  | '크레딧' | '포인트';

/** 도메인 밖(계정 모듈 소관) — 실명·연락처. */
type BannedIdentityKey = 'name' | 'real_name' | 'phone' | 'email' | '실명' | '연락처';

type BannedKey = BannedScoreKey | BannedRewardKey | BannedIdentityKey;

/** 금지 키를 타입 차원에서 봉인한다. */
export type Sealed<T> = T & { [K in BannedKey]?: never };

/* ──────────────────────────────── 오류 ──────────────────────────────── */

export type PlannerErrorCode =
  | 'EMPTY_PLAN'                 // §2-1 엣지: study_days=0 (빈 계획 금지)
  | 'GUARDIAN_CONSENT_REQUIRED'  // §1-1 미성년 보호자 동의 누락
  | 'INVALID_PERIOD'
  | 'INVALID_PLAN_ITEM';

export class PlannerError extends Error {
  constructor(readonly code: PlannerErrorCode, message: string) {
    super(message);
    this.name = 'PlannerError';
  }
}

/* ─────────────────────────── 1) journey ─────────────────────────── */

/** 운전자 — 본인/보호자/공동. */
export type Driver = 'self' | 'guardian' | 'co';
/** 초등이하 / 중등 / 고등·N수 / 성인. */
export type AgeBand = 'elem' | 'middle' | 'high' | 'adult';
export type GoalType = 'exam' | 'habit' | 'custom';
/** 동반 강도 1(친구)~5(서약). v1 엔진은 1~3만 사용한다. */
export type Intensity = 1 | 2 | 3 | 4 | 5;

export interface Goal {
  type: GoalType;
  label: string;
  d_day?: ISODate;
}

/** 미성년은 guardian 동의가 필수(§1-1). */
export interface Consent {
  guardian: boolean;
  notify_guardian: boolean;
}

export type Journey = Sealed<{
  user_id: string;
  driver: Driver;
  age_band: AgeBand;
  goal: Goal;
  intensity: Intensity;
  consent: Consent;
}>;

const MINOR_BANDS: readonly AgeBand[] = ['elem', 'middle', 'high'];

/** 미성년 여부 — 'high'는 고등·N수를 함께 묶는다(스펙 §1). */
export function isMinor(band: AgeBand): boolean {
  return MINOR_BANDS.includes(band);
}

/**
 * 여정 생성 — 미성년 + 보호자 미동의는 거부한다(§3 테스트 10).
 * 입력을 변형하지 않고 그대로 돌려준다(강도 클램프는 effectiveIntensity 로 분리).
 */
export function makeJourney(input: Journey): Journey {
  if (isMinor(input.age_band) && input.consent.guardian !== true) {
    throw new PlannerError(
      'GUARDIAN_CONSENT_REQUIRED',
      '미성년(elem·middle·high) 여정은 보호자 동의(consent.guardian)가 필수입니다.',
    );
  }
  return input;
}

/** v1 엔진이 실제로 분기하는 강도(1~3). 4·5는 3으로 클램프하되 원본은 보존한다. */
export function effectiveIntensity(journey: Journey): 1 | 2 | 3 {
  return Math.min(3, Math.max(1, journey.intensity)) as 1 | 2 | 3;
}

/* ───────────────────────── 2) availability ───────────────────────── */

/** 학습 환경 — 배정 힌트의 근거(§2-1 env 규칙). */
export type Env = 'home' | 'study' | 'academy' | 'school' | 'transit' | 'etc';

/**
 * 이 슬롯에서 가능한 소통 모드 — **상담(화상/음성/채팅) 예약의 교집합 계산 입력**.
 *
 * 왜 availability 에 있는가: 환경(env)과 가능한 모드는 같은 사실의 두 면이다.
 * 독서실이면 chat+whiteboard, 카페면 voice 까지, 집이면 video 까지 — 시간대마다 다르다.
 * 상담용으로 별도 스키마를 만들면 같은 사실이 두 곳에 저장돼 어긋난다(availability 규약 재사용 원칙).
 */
export type SlotMode = 'video' | 'voice' | 'chat' | 'whiteboard';

/** 환경별 기본 가능 모드 — 사용자가 지정하지 않았을 때의 보수적 추정(항상 덮어쓸 수 있다). */
export const DEFAULT_MODES_BY_ENV: Readonly<Record<Env, readonly SlotMode[]>> = Object.freeze({
  home: ['video', 'voice', 'chat', 'whiteboard'],
  study: ['chat', 'whiteboard'],            // 독서실 — 소리 불가
  academy: ['voice', 'chat', 'whiteboard'], // 독학학원 — 이어폰 가능 가정
  school: ['chat', 'whiteboard'],
  transit: ['voice', 'chat'],               // 이동 중 — 판서 불가
  etc: ['chat'],                            // 알 수 없으면 가장 좁게
});

export interface WeeklySlot {
  dow: Dow;
  /** 'HH:MM' */
  start: string;
  /** 'HH:MM' */
  end: string;
  env: Env;
  /**
   * 이 시간대에 가능한 소통 모드. 생략하면 env 기본값(DEFAULT_MODES_BY_ENV)으로 해석한다 —
   * **없다고 해서 '전부 가능'으로 넓히지 않는다**(예약 기대 불일치가 사고로 이어지므로 보수적 기본값).
   */
  modes?: readonly SlotMode[];
}

/** 슬롯의 실효 모드 — 명시값 우선, 없으면 env 기본값. 빈 배열은 '명시적으로 없음'으로 존중한다. */
export function slotModes(slot: WeeklySlot): readonly SlotMode[] {
  return slot.modes ?? DEFAULT_MODES_BY_ENV[slot.env];
}

/**
 * 양측 슬롯의 **교집합 모드** — 예약 시 "이 시간엔 어떤 상담이 가능한가"의 답.
 * 교집합이 비면 그 시간대는 상담 불가(예약 단계에서 걸러야 한다 — 입장 후 알면 늦다).
 * 모드 우선순위(풍부한 쪽 우선)로 정렬해 첫 항목을 기본 제안으로 쓸 수 있게 한다.
 */
const MODE_RANK: readonly SlotMode[] = ['video', 'voice', 'whiteboard', 'chat'];
export function intersectModes(a: WeeklySlot, b: WeeklySlot): readonly SlotMode[] {
  const bs = new Set(slotModes(b));
  return MODE_RANK.filter((m) => bs.has(m) && slotModes(a).includes(m));
}

/** 특정 날짜의 예외 — 통째 휴무(off)거나 슬롯 추가(add). */
export interface AvailabilityException {
  date: ISODate;
  delta: 'off' | 'add';
  slots?: WeeklySlot[];
}

export type Availability = Sealed<{
  user_id: string;
  weekly_slots: WeeklySlot[];
  exceptions: AvailabilityException[];
}>;

/* ───────────────────────────── 3) plan ───────────────────────────── */

/** 분량 단위 — 강 수·페이지·문제 수. */
export type UnitType = 'lecture' | 'page' | 'problem';
/** 하루 n개(per_day) vs D-day 역산(d_day). */
export type SplitMode = 'per_day' | 'd_day';
/** 학습일 패턴 4종. */
export type StudyPattern = 'daily' | 'alt' | 'no_weekend' | 'custom';

export interface PlanItem {
  /** 콘텐츠 DB 키(인강 시드 id 또는 교재 slug) — 도메인은 문자열로만 참조한다. */
  content_ref: string;
  total_units: number;
  unit_type: UnitType;
  split_mode: SplitMode;
  per_day?: number;
  target_date?: ISODate;
  study_pattern: StudyPattern;
  /** study_pattern='custom' 일 때의 학습 요일. */
  custom_days?: Dow[];
  /** 이 콘텐츠에 적합한 환경(배정 힌트) — 기본 매핑보다 우선한다. */
  env_pref?: Env[];
}

export interface Period {
  start: ISODate;
  end: ISODate;
}

export type Plan = Sealed<{
  id: string;
  user_id: string;
  /** journey.goal 참조. */
  goal_ref: string;
  period: Period;
  items: PlanItem[];
}>;

/* ───────────────────────────── 4) todo ───────────────────────────── */

export interface TodoTask {
  content_ref: string;
  unit_label: string;
  qty: number;
  done: boolean;
  /** 완료 시각(ISO 8601). 도메인은 읽기만 한다. */
  done_ts?: string;
  /** 이월된 과제의 원래 날짜 — 연쇄 이월 추적(§2-2). */
  carried_from?: ISODate;
}

/**
 * 일 단위 원장 = 유일한 사실원(§1-4).
 * 주·월·시즌 뷰는 이 배열의 집계 함수로만 산출한다 — 별도 저장 금지(이중 장부 금지).
 */
export type Todo = Sealed<{
  plan_id: string;
  date: ISODate;
  tasks: TodoTask[];
  /** paced_lock — 재진단 게이트. */
  locked: boolean;
}>;

/* ─────────────────────────── 5) ghost_track ─────────────────────────── */

/** 실존 인물 표현 금지 — v1은 'constructed'(구성 모델) 라벨 고정(§1-5, D-005). */
export interface GhostPersona {
  nickname: string;
  start_band: string;
  goal_label: string;
}

export interface GhostWeeklyPace {
  week: number;
  hours_by_subject: Record<string, number>;
  milestone?: string;
}

export type GhostTrack = Sealed<{
  id: string;
  label: 'constructed';
  persona: GhostPersona;
  weekly_pace: GhostWeeklyPace[];
  /** 현실 페이스 — 슬럼프 구간을 포함한다. */
  slump_weeks: number[];
}>;

/* ──────────────────────────── 6) cohort ──────────────────────────── */

export type CohortMember = Sealed<{
  anon_id: string;
  nickname: string;
  joined: ISODate;
  dormant: boolean;
}>;

/** 빌보드는 저장하지 않는다 — 주간 집계 함수(weeklyBoard)로만 산출(§1-6). */
export type Cohort = Sealed<{
  id: string;
  band: string;
  season: string;
  /** 기본 25. */
  capacity: number;
  members: CohortMember[];
}>;

export const DEFAULT_COHORT_CAPACITY = 25;
