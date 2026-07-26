/**
 * 회원 등급 **비크레딧** 혜택 정책 (B218 — O50 가격 확정에서 파생).
 *
 * 왜 필요한가: O50 확정 과정에서 등급 차별화를 "크레딧을 더 준다"로만 설계하면
 * 마진이 그대로 깎인다는 것이 드러났다. 배분 원가(원 매출 × 60%)가 크레딧에 **선형**이라,
 * VIP 에 볼륨 할인을 주려고 부여를 380,000 → 470,000 크로 올리면 스트레스 마진이 0.9% 가 된다
 * (근거: `ops/pricing-sim.mjs --ladder-probe`, 워크시트 §3).
 * 그래서 상위 등급의 실질 차별화는 **원가가 등급에 비례하지 않는 축**에서 만든다.
 *
 * 설계 원칙 — 아래 축만 혜택으로 쓴다:
 *   ① 순서처럼 **총량을 늘리지 않는** 것(경합에서의 우선권)
 *   ② 정적 산출물 접근권처럼 **한계원가 ≈ 0** 인 것(배치표 티어)
 *   ③ 원가가 있어도 **등급당 수백 원 수준**으로 상한이 명확한 것(AI 리포트 발급 횟수)
 *
 * 왜 정책값인가: 혜택 구성은 전환율을 보고 조정하는 값이다. 코드에 박으면 조정마다 배포가 필요하다.
 * 해석 순서는 다른 정책과 동일 — 아래 기본값 ← `system_setting` override.
 */
export const GRADE_BENEFITS_KEY = 'grade_benefits_policy';

/** 배치표·입결 산출물 티어(빌드 산출 `dist-tier/*` 와 같은 이름). */
export type PlacementTier = 'free' | 'member' | 'paid';

export interface GradeBenefit {
  /**
   * Q&A 답변 큐 가중치. 클수록 선생님 목록 상단에 온다.
   * **총 답변량을 늘리는 것이 아니라 순서만 바꾼다** → 원가 0.
   */
  qnaQueueWeight: number;
  /**
   * 동시 보유 가능한 미완료(confirmed/new) 예약 수. **0 = 무제한.**
   *
   * B222 정리: 이 축의 본질은 등급 판매가 아니라 **슬롯 선점 방지**(운영 통제)다.
   * 총 소비량은 크레딧이 이미 제한하므로 여기서 더 조여도 매출이 늘지 않는다.
   * 그래서 소유자는 센터(`limit_policy.reservation_limit`)이고, 등급값은 **선택적 추가 제한**이다.
   * 기본값을 전 등급 0(무제한)으로 두어, 켜는 것이 의도적 결정이 되게 한다(§ effectiveConcurrentBookings).
   */
  concurrentBookings: number;
  /** 접근 가능한 배치표·입결 산출물 티어. 정적 산출물이라 한계원가 ≈ 0. */
  placementTier: PlacementTier;
  /** AI 진단·컨설팅 리포트 월 발급 횟수. 1건 ≈ 67원(Sonnet 4.6 기준)이라 상한이 곧 원가 상한. */
  aiReportsPerMonth: number;
  /** 자동매칭 탐색 지평(일). 넓을수록 자리를 찾을 확률이 높다 → 원가 0(조회 범위만 증가). */
  matchHorizonDays: number;
}

/**
 * 등급 tier(membership_grade.tier) → 혜택.
 * tier 1=Basic · 2=Standard · 3=Premium · 4=VIP (seed.ts 와 동일 체계).
 *
 * VIP 가 Premium 대비 갖는 우위는 크레딧 쪽에서 +7.5% 에서 멈췄다(O50) — 나머지 우위를
 * 여기서 만든다: 큐 가중치 2배 · 리포트 2배 · 탐색 지평 3주.
 * (`concurrentBookings` 는 혜택이 아니라 운영 통제로 재분류했다 — B222. 기본 무제한.)
 */
export const GRADE_BENEFITS_DEFAULT: Record<number, GradeBenefit> = {
  1: {
    qnaQueueWeight: 0,
    concurrentBookings: 0,
    placementTier: 'member', // 가입만 해도 회원 티어 — 무료 가입이 리드 확보 수단(기획서 v2)
    aiReportsPerMonth: 0,
    matchHorizonDays: 7,
  },
  2: {
    qnaQueueWeight: 0,
    concurrentBookings: 0,
    placementTier: 'member',
    aiReportsPerMonth: 1,
    matchHorizonDays: 7,
  },
  3: {
    qnaQueueWeight: 1,
    concurrentBookings: 0,
    placementTier: 'paid',
    aiReportsPerMonth: 3,
    matchHorizonDays: 14,
  },
  4: {
    qnaQueueWeight: 2,
    concurrentBookings: 0,
    placementTier: 'paid',
    aiReportsPerMonth: 6,
    matchHorizonDays: 21,
  },
};

/** 등급이 없는 계정(미구독·외부생 등)의 혜택 — Basic 과 같게 두되 배치표는 무료 티어. */
export const NO_GRADE_BENEFIT: GradeBenefit = {
  qnaQueueWeight: 0,
  concurrentBookings: 0,
  placementTier: 'free',
  aiReportsPerMonth: 0,
  matchHorizonDays: 7,
};

/**
 * 안전선. 정책을 잘못 열어 원가·공정성이 깨지는 것을 서버가 막는다.
 * - `maxQnaQueueWeight`: 가중치가 커지면 하위 등급 질문이 영구히 밀린다(§ 기아 상태).
 *   기아는 `QUEUE_FAIRNESS.staleAfterHours` 로도 막지만 가중치 자체에도 상한을 둔다.
 * - `maxAiReportsPerMonth`: 유일하게 실원가가 붙는 축 — B008 일 상한과 충돌하지 않는 범위.
 * - `maxMatchHorizonDays`: 지평이 길어지면 매칭 1회의 DB 조회가 선형으로 늘어난다.
 */
export const GRADE_BENEFITS_GUARD = {
  maxQnaQueueWeight: 3,
  maxAiReportsPerMonth: 20,
  maxMatchHorizonDays: 30,
  maxConcurrentBookings: 50,
} as const;

/**
 * Q&A 큐 공정성 — **등급 우선권이 기아를 만들지 않게 하는 장치**.
 *
 * 가중치만으로 정렬하면 Basic 학생의 질문이 상위 등급 질문에 계속 밀려 영구히 안 풀린다.
 * 그래서 일정 시간이 지난 질문은 **등급을 무시하고 가장 앞으로** 보낸다.
 * 기준 시간은 급여의 48h 미답 보상(payroll `staleAnswerBonus`, T5c)과 같은 48시간으로 맞췄다 —
 * 보상이 걸리는 시점과 큐가 끌어올리는 시점이 어긋나면 정책이 서로 싸운다.
 */
export const QUEUE_FAIRNESS = { staleAfterHours: 48 } as const;

/** 저장값이 부분적/오염돼 있어도 기본값으로 메꿔 안전한 정책을 만든다. */
export function resolveGradeBenefits(
  stored: unknown,
): Record<number, GradeBenefit> {
  const s = (stored ?? {}) as Record<string, Partial<GradeBenefit>>;
  const out: Record<number, GradeBenefit> = {};
  for (const [tier, def] of Object.entries(GRADE_BENEFITS_DEFAULT)) {
    out[Number(tier)] = { ...def, ...(s[tier] ?? {}) };
  }
  return out;
}

/** 등급 tier 로 혜택 조회. 미구독·미지정은 NO_GRADE_BENEFIT. */
export function benefitOf(
  benefits: Record<number, GradeBenefit>,
  tier: number | null | undefined,
): GradeBenefit {
  if (tier == null) return NO_GRADE_BENEFIT;
  return benefits[tier] ?? NO_GRADE_BENEFIT;
}

/**
 * Q&A 답변 큐 정렬 키. 선생님 목록의 순서를 정한다.
 *
 * 정렬 규칙(우선순위 순):
 *   ① 48시간 초과 미답 질문 — 등급 무시, **오래된 것부터**(기아 방지 + T5c SLA 와 정합)
 *   ② 그 외 — 등급 가중치 높은 것부터, 같으면 **최신부터**(기존 동작 유지)
 *
 * 비교 함수로 쓸 수 있게 (a,b) => number 를 반환한다.
 */
export function compareQnaQueue(
  a: { createdAt: Date; weight: number },
  b: { createdAt: Date; weight: number },
  now: Date,
): number {
  const staleMs = QUEUE_FAIRNESS.staleAfterHours * 3_600_000;
  const aStale = now.getTime() - a.createdAt.getTime() >= staleMs;
  const bStale = now.getTime() - b.createdAt.getTime() >= staleMs;
  if (aStale !== bStale) return aStale ? -1 : 1; // 미답 초과분이 항상 먼저
  if (aStale && bStale) return a.createdAt.getTime() - b.createdAt.getTime(); // 오래된 것부터
  if (a.weight !== b.weight) return b.weight - a.weight; // 등급 가중치 높은 것부터
  return b.createdAt.getTime() - a.createdAt.getTime(); // 최신부터(기존 동작)
}

/**
 * 동시 보유 예약 상한의 **유효값** (B222 — 두 정책이 같은 것을 제한하는 문제의 해소).
 *
 * 두 knob 이 있다:
 *   - 센터 `limit_policy.reservation_limit` — 운영 통제(슬롯이 한쪽으로 쏠리는 것을 막는다)
 *   - 등급 `concurrentBookings` — 선택적 추가 제한
 *
 * 규칙: **더 엄격한 쪽이 이긴다.** 센터가 운영상 조인 값을 등급 혜택이 뚫으면 안 되기 때문이다
 * (등급은 회사가 파는 것이고 센터 한도는 현장이 감당할 수 있는 양이다 — 후자가 물리적 제약이다).
 *
 * 그래서 "VIP 무제한"은 **센터 한도 안에서의 무제한**이다. 이 함수가 유효값을 하나로 확정하고,
 * 화면·API 는 이 값을 그대로 노출해 광고와 실제가 갈라지지 않게 한다.
 *
 * @returns 0 = 무제한
 */
export function effectiveConcurrentBookings(
  gradeLimit: number,
  centerLimit: number | null | undefined,
): number {
  const g = gradeLimit > 0 ? gradeLimit : null; // 0/음수 = 무제한
  const c = centerLimit != null && centerLimit > 0 ? centerLimit : null;
  if (g == null && c == null) return 0; // 양쪽 무제한
  if (g == null) return c!;
  if (c == null) return g;
  return Math.min(g, c); // 더 엄격한 쪽
}
