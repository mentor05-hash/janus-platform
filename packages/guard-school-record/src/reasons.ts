/**
 * 생기부 가드 사유 코드.
 *
 * 판정 결과가 담는 것은 boolean(차단 여부) + 사유 코드뿐이다.
 * 원본 바이트·추출 텍스트·매칭된 키워드 원문은 사유에 절대 싣지 않는다(무취급 원칙).
 */
export const REASON = {
  /** 파일명이 생기부 패턴에 일치 */
  FILENAME: 'SR_FILENAME',
  /** 추출 텍스트에서 생기부 서식 키워드가 임계 이상 검출 */
  KEYWORD: 'SR_KEYWORD',
  /** 비전 분류기가 생기부로 확신 판정(yes) */
  VISION: 'SR_VISION',
  /** 비전 분류기가 판단을 확신하지 못함(unsure) → 무취급 기본값에 따라 **차단** + 이의 안내(§4-b) */
  UNSURE: 'SR_UNSURE',
} as const;

export type ReasonCode = (typeof REASON)[keyof typeof REASON];

/** 판정이 통과한 단계(내용이 아닌 메타데이터). */
export type GuardStage = 'filename' | 'keyword' | 'vision';
