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
  ocr: 100,
  consulting: 60,
};

/** 합산 상한은 개별 합(560)보다 낮게 — 한 용도가 몰아 써도 총액이 먼저 막힌다. */
export const LLM_DEFAULT_TOTAL_LIMIT = 400;

/** ENV 키 규약 — 용도별 상한은 `LLM_DAILY_LIMIT_<PURPOSE>`. */
export function llmDailyLimitEnvKey(purpose: LlmPurpose): string {
  return `LLM_DAILY_LIMIT_${purpose.toUpperCase()}`;
}
