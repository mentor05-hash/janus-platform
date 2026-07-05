/**
 * 도메인 상수 · 정책 fallback 기본값 (CLAUDE.md §5, §9).
 * 미결정(🔲) 단가/임계는 관리자 정책 테이블이 우선이며, 값 부재 시 여기 기본값을 fallback 으로 사용.
 * 환경 의존값은 하드코딩 금지(§10) — ENV 에서 읽고, 여기엔 "코드 불변 도메인 규칙"만 둔다.
 */

/** §5-1 휴게 버퍼: 모든 예약 앞뒤 각 10분. */
export const REST_BUFFER_MINUTES = 10;

/**
 * O1 크레딧↔현금 환산 비율(원/크레딧). 구독 유닛 이코노믹스 확정값.
 * 크레딧은 "할인 포인트" — 지급량은 크게, 원 가치는 절반(1크 = 0.5원). 매출·급여의 원 환산에만 적용.
 * (세션 크레딧 차감·계좌 잔액은 크레딧 단위 그대로.)
 */
export const CREDIT_WON_RATIO = 0.5;

/** 슬롯 1칸 = 10분 단위(time_slot.slot_index 기준). */
export const SLOT_GRANULARITY_MINUTES = 10;

/**
 * §5-2 요금 기본값(원/시간 등) — 관리자 pricing_policy 부재 시 fallback.
 * 줌 30분 일반 = round(40000 × 30 ÷ 60) = 20,000 / S급(+20%) = 24,000 (테스트 시드값).
 */
export const PRICING_DEFAULTS = {
  perHour: {
    board: 12_000,
    chat: 18_000,
    zoom: 40_000,
    hand: 36_000,
    offline: 30_000,
  },
  /** 게시판 건당(문항 ≥ 일반 — DB CHECK 제약과 일치). */
  boardItemFee: 8_000,
  boardGeneralFee: 4_000,
  /** S급 할증율(%). */
  sGradeSurchargePct: 20,
} as const;

/** §5-2 요금 계산식: cost = round(perHour × min ÷ 60). S급은 할증 후 계산. */
export function computeSessionCost(
  perHour: number,
  minutes: number,
  surchargePct = 0,
): number {
  const base = (perHour * minutes) / 60;
  const surcharged = base * (1 + surchargePct / 100);
  return Math.round(surcharged);
}

/** §5-9 분류 한도 기본값(fit/unfit). 한도 축소 시 기존 유지(동결)·신규만 차단. */
export const CLASSIFY_LIMITS = { fit: 10, unfit: 30 } as const;

/** §5-7 검색 랭킹 가중치: 교사 사유 취소 1건당 유효 평점 하락폭(취소 누적 → 순위 하락). */
export const RANK_CANCEL_WEIGHT = 0.2;

/** §5-3 주간 크레딧: 월요일 00:00 부여 / 일요일 24:00 소멸 (이월 없음). */
export const WEEKLY_GRANT = {
  grantCron: '0 0 * * 1',
  expireCron: '59 23 * * 0',
} as const;
