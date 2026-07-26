import { GradeBenefit } from './grade-benefits';
import { LlmPurpose } from '../../llm/llm.types';

/**
 * AI 사용량 3층 정책 (B221).
 *
 * B218 설계 후 드러난 모순: 등급 혜택 `aiReportsPerMonth` 는 "쓸 수 있다"는 **권리**이고
 * B008 의 `LLM_DAILY_LIMIT_*` 는 "이 이상 못 쓴다"는 **전역 보호**인데, 서로를 몰랐다.
 * 그래서 판 권리를 전역 상한이 거절할 수 있었다 — 권리를 안 주는 것보다 나쁜 상태다.
 *
 * 층을 명시적으로 나눠 해소한다:
 *
 *   1층 사용자별 한도 (`SubjectQuota`)
 *      - 남용 방지: 사용자 1인이 공유 예산을 혼자 태우는 것을 막는다. 무료 사용자도 대상.
 *      - 권리 보장: 등급이 산 월 한도를 사용자 단위로 센다.
 *   2층 전역 일 상한 (`UsageQuota`, B008)
 *      - 생존선. 다만 **예약분/재량분으로 쪼개** 재량 호출이 매출 연동 호출을 굶기지 못하게 한다.
 *   3층 정합 불변식 (이 파일의 `reconcileCapacity`)
 *      - **2층이 감당할 수 없는 양의 권리를 팔지 못하게** 쓰기 시점에 막는다.
 *
 * 3층이 핵심이다. 1·2층만 있으면 여전히 "월 20건 × 100명"을 팔아 놓고 못 지키는 일이 가능하다.
 */
export const AI_USAGE_KEY = 'ai_usage_policy';

/**
 * 매출로 뒷받침되는 용도 — 2층에서 **예약분**을 쓴다.
 *
 * `consulting` 은 별도 결제(`consulting_payment.status='paid'`) 또는 등급 권리로만 도달하므로
 * 이 호출이 재량 호출(관리자 OCR 일괄 처리 등) 때문에 막히면 곧 약속 위반이다.
 * 나머지(`ocr`·`report`·`similarity`)는 스태프·내부 트리거라 재량분에서 쓴다.
 */
export const RESERVED_PURPOSES: readonly LlmPurpose[] = ['consulting'];

/** 등급 권리 `aiReportsPerMonth` 가 소비하는 LLM 용도. 3층 계산의 대상이 된다. */
export const AI_REPORT_PURPOSE: LlmPurpose = 'consulting';

export interface AiUsagePolicy {
  /**
   * 사용자 1인 일 신고 AI 검토 횟수(1층 남용 방지).
   *
   * `POST /reports` 는 **모든 인증 사용자**에게 열려 있고 호출마다 유료 LLM 을 부른다.
   * 사용자별 한도가 없으면 한 명이 `report` 용도 상한(100/일)을 혼자 태울 수 있다.
   */
  reportReviewPerUserDay: number;
  /**
   * 2층 전역 상한 중 예약분 비율(0~0.9). 재량 용도는 `total × (1 − 이 값)` 까지만 쓴다.
   * 0 이면 예약 없음(기존 동작과 동일).
   */
  reservePctForEntitled: number;
  /**
   * 3층 피크 계수. 월 권리가 하루에 균등히 퍼지지 않으므로(성적 발표·원서 시즌에 몰린다)
   * 일 평균의 몇 배를 감당할 수 있어야 하는지.
   */
  peakFactor: number;
}

export const AI_USAGE_DEFAULT: AiUsagePolicy = {
  reportReviewPerUserDay: 5,
  reservePctForEntitled: 0.4,
  peakFactor: 3,
};

/** 안전선 — 정책을 잘못 열어 층 구조가 무너지는 것을 막는다. */
export const AI_USAGE_GUARD = {
  maxReportReviewPerUserDay: 50,
  /** 예약분이 과반을 넘으면 재량 용도(관리자 업무)가 상시 막힌다. */
  maxReservePct: 0.9,
  minPeakFactor: 1,
  maxPeakFactor: 10,
} as const;

/** 저장값이 부분적/오염돼 있어도 기본값으로 메꾼다. */
export function resolveAiUsage(stored: unknown): AiUsagePolicy {
  const s = (stored ?? {}) as Partial<AiUsagePolicy>;
  return { ...AI_USAGE_DEFAULT, ...s };
}

/**
 * 재량 용도가 쓸 수 있는 전역 일 상한. 예약분을 뺀 값.
 * 예약 용도는 전액(`total`)을 쓸 수 있으므로 예약분이 실제로 "남겨진다".
 */
export function discretionaryTotalLimit(
  total: number,
  reservePct: number,
): number {
  if (total <= 0) return total; // 0 이하 = 무제한 의도. 그대로 둔다.
  const pct = Math.min(Math.max(reservePct, 0), AI_USAGE_GUARD.maxReservePct);
  return Math.max(1, Math.floor(total * (1 - pct)));
}

export interface CapacityCheck {
  /** 판 권리를 지키기 위해 필요한 일 처리량 */
  requiredPerDay: number;
  /** 2층이 예약 용도에 실제로 허용하는 일 처리량 */
  availablePerDay: number;
  ok: boolean;
  /** 등급별 기여분 — 어디서 초과했는지 운영자가 보게 */
  byTier: { tier: number; users: number; perMonth: number; perDay: number }[];
}

/**
 * 3층 정합 검사 — **판 권리 ≤ 감당 가능량** 인지 본다.
 *
 * requiredPerDay = Σ(등급 사용자 수 × 월 권리) ÷ 30 × 피크계수
 * availablePerDay = 해당 용도의 일 상한(예약 용도는 전액 사용 가능)
 *
 * 사용자 수가 0이면 required 도 0이라 항상 통과한다 — 즉 **초기에는 아무 제약이 없고,
 * 실제로 회원이 늘어난 뒤에야 상한을 올리라고 요구한다**. 그게 맞는 순서다.
 */
export function reconcileCapacity(input: {
  benefits: Record<number, GradeBenefit>;
  usersByTier: Record<number, number>;
  purposeDailyLimit: number;
  peakFactor: number;
}): CapacityCheck {
  const { benefits, usersByTier, purposeDailyLimit, peakFactor } = input;
  const factor = Math.max(AI_USAGE_GUARD.minPeakFactor, peakFactor);

  const byTier = Object.entries(benefits).map(([t, b]) => {
    const tier = Number(t);
    const users = usersByTier[tier] ?? 0;
    const perMonth = users * b.aiReportsPerMonth;
    return { tier, users, perMonth, perDay: (perMonth / 30) * factor };
  });

  const requiredPerDay = Math.ceil(byTier.reduce((s, x) => s + x.perDay, 0));
  // 일 상한 0 이하 = 무제한 의도 → 언제나 감당 가능.
  const availablePerDay =
    purposeDailyLimit <= 0 ? Number.POSITIVE_INFINITY : purposeDailyLimit;

  return {
    requiredPerDay,
    availablePerDay,
    ok: requiredPerDay <= availablePerDay,
    byTier: byTier.map((x) => ({ ...x, perDay: Math.ceil(x.perDay) })),
  };
}

/** 정합 위반 시 운영자가 바로 행동할 수 있게 숫자를 담은 문장으로 만든다. */
export function capacityMessage(c: CapacityCheck, purpose: string): string {
  const worst = [...c.byTier].sort((a, b) => b.perDay - a.perDay)[0];
  return (
    `판매한 권리를 감당할 수 없습니다: 필요 ${c.requiredPerDay}건/일 > 상한 ${c.availablePerDay}건/일` +
    `(용도 ${purpose}).` +
    (worst && worst.perDay > 0
      ? ` 가장 큰 기여는 등급 ${worst.tier}(${worst.users}명 × 월 ${
          worst.users ? worst.perMonth / worst.users : 0
        }건 = ${worst.perDay}건/일)입니다.`
      : '') +
    ` 권리를 낮추거나 LLM_DAILY_LIMIT_${purpose.toUpperCase()} 를 올려야 합니다.`
  );
}
