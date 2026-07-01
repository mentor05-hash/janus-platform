/**
 * LlmProvider 어댑터 (CLAUDE.md §9·§10). 신고 AI 1차 검토 + 답변 유사도 검사.
 * 로컬은 휴리스틱 stub, 추후 Claude/GPT 등 실모델로 교체(ENV LLM_PROVIDER).
 */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

// ── 신고 자동검토 ──
export interface ReportReviewInput {
  targetType: string;
  reason: string;
}
export interface ReportReviewResult {
  flagged: boolean;
  severity: 'none' | 'low' | 'high';
  category?: string; // 욕설·성희롱·사기 등 분류(있으면)
  summary: string;
  suggestedAction: string; // none | warn | suspend ...
}

// ── 답변 유사도(표절·중복 답변 탐지) ──
export interface AnswerSimilarityInput {
  body: string;
  priors: { id: string; body: string }[];
}
export interface AnswerSimilarityResult {
  flagged: boolean;
  maxSimilarity: number; // 0~1
  similarToId?: string;
  summary: string;
}

// ── 성적표 OCR(비전) ──
export interface ScoreOcrInput {
  imageBase64: string;
  mimeType: string;
}
export interface ScoreOcrItem {
  subject: string;
  score: number | null;
  maxScore?: number | null;
  grade?: string | null;
}
export interface ScoreOcrResult {
  demo: boolean; // 실 비전모델 미연동 시 데모 추출(값 검증 필요)
  period?: string;
  examType?: string;
  items: ScoreOcrItem[];
  note: string;
}

export interface LlmProvider {
  reviewReport(input: ReportReviewInput): Promise<ReportReviewResult>;
  checkAnswerSimilarity(input: AnswerSimilarityInput): Promise<AnswerSimilarityResult>;
  extractScoreReport(input: ScoreOcrInput): Promise<ScoreOcrResult>;
}
