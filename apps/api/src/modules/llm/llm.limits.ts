import { LlmPurpose } from './llm.types';

/**
 * LLM 일 상한 기본값 (B008). **단일 소스** — 어댑터 조립(`llm.module.ts`)과
 * 정합 검사(`pricing-policy` 3층 가드)가 같은 값을 봐야 한다.
 *
 * 여기 있던 상수를 `llm.module.ts` 에서 뽑아낸 이유: 정합 검사가 "이 용도의 일 상한이 얼마인가"를
 * 알아야 하는데, 정책 서비스가 인프라 모듈(@Module)을 import 하면 층이 뒤집힌다. 잎 파일로 분리한다.
 *
 * 용도별 성격:
 *   similarity — 답변마다 걸려 호출 수가 가장 많다
 *   ocr·consulting — 1인당 1~2회로 끝나지만 이미지·긴 프롬프트라 호출당 단가가 높다
 */
export const LLM_DEFAULT_LIMITS: Record<LlmPurpose, number> = {
  report: 100,
  similarity: 300,
  draft: 200,
  ocr: 100,
  vision: 100,
  consulting: 60,
  // 무료 진입점이라 유입이 곧 호출이다 — 실행계획서가 지목한 폭주 지점이므로 가장 보수적으로.
  gateway: 150,
  consultReport: 80,
};

/**
 * 합산 상한은 개별 합(1,090)보다 훨씬 낮게 — 한 용도가 몰아 써도 총액이 먼저 막힌다.
 * 개별 상한은 "용도별 격리"용이고, 총액을 지키는 것은 이 값이다.
 */
export const LLM_DEFAULT_TOTAL_LIMIT = 500;

/** ENV 키 규약 — 용도별 상한은 `LLM_DAILY_LIMIT_<PURPOSE>`. */
export function llmDailyLimitEnvKey(purpose: LlmPurpose): string {
  return `LLM_DAILY_LIMIT_${purpose.toUpperCase()}`;
}
