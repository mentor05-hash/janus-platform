/**
 * LlmProvider 어댑터 (CLAUDE.md §9·§10). 신고 AI 1차 검토.
 * 로컬은 mock stub, 추후 Claude/GPT 등 구현으로 교체(ENV LLM_PROVIDER).
 */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export interface ReportReviewInput {
  targetType: string;
  reason: string;
}

export interface ReportReviewResult {
  flagged: boolean;
  summary: string;
  suggestedAction: string; // none | warn | suspend ...
}

export interface LlmProvider {
  reviewReport(input: ReportReviewInput): Promise<ReportReviewResult>;
}
