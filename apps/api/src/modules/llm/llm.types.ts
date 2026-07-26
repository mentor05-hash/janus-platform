/**
 * LlmProvider 어댑터 (CLAUDE.md §9·§10). 신고 AI 1차 검토 + 답변 유사도 검사.
 * 로컬은 휴리스틱 stub, 추후 Claude/GPT 등 실모델로 교체(ENV LLM_PROVIDER).
 */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

/**
 * 호출 용도 — 일 호출 상한을 용도별로 나눠 하나가 폭주해도 나머지가 살아남게 한다.
 * (실행계획서 §비용: "무료 관문 홈·Q&A AI 초안이 비용 폭주 지점")
 */
export const LLM_PURPOSES = [
  'report',
  'similarity',
  'ocr',
  'consulting',
] as const;
export type LlmPurpose = (typeof LLM_PURPOSES)[number];

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

// ── 컨설팅 분석(생기부 등 · 설계안 §7) ──
// 입력에는 식별정보(이름·연락처)를 넣지 않는다(마스킹). 산출물은 컨설턴트 검수용 "초안".
export interface ConsultingAnalysisInput {
  grade: string;
  interest: string;
  package: string;
  documents: { type: string; name: string }[];
}
export interface ConsultingAnalysisResult {
  summary: { strengths: string[]; concerns: string[]; highlights: string[] };
  diagnostic: {
    fit_directions: string[];
    activity_suggestions: string[];
    target_gap: string;
  };
  document_check: {
    missing: string[];
    inconsistencies: string[];
    requests: string[];
  };
  model: string; // 'mock' | claude 모델 태그
}

export interface LlmProvider {
  reviewReport(input: ReportReviewInput): Promise<ReportReviewResult>;
  checkAnswerSimilarity(
    input: AnswerSimilarityInput,
  ): Promise<AnswerSimilarityResult>;
  extractScoreReport(input: ScoreOcrInput): Promise<ScoreOcrResult>;
  analyzeConsulting(
    input: ConsultingAnalysisInput,
  ): Promise<ConsultingAnalysisResult>;
}
