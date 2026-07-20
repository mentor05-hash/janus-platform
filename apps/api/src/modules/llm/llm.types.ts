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
  diagnostic: { fit_directions: string[]; activity_suggestions: string[]; target_gap: string };
  document_check: { missing: string[]; inconsistencies: string[]; requests: string[] };
  model: string; // 'mock' | claude 모델 태그
}

// ── 관문 해석(W2 D5 — 관문 홈 자유서술 → 의도·커리큘럼 카드) ──
// 입력은 반드시 마스킹된 텍스트(gateway 도메인 maskSensitive 통과분).
export interface GatewayInterpretInput {
  text: string;
}
export interface GatewayLlmCard {
  title: string;
  desc: string;
  service: string; // diagnosis|qna|consulting|tutoring|lecture|mental|curriculum
  to: string; // 웹 라우트
}
export interface GatewayLlmResult {
  intent: string; // diagnosis|qna|consulting|tutoring|lecture|mental|unknown
  summary: string;
  cards: GatewayLlmCard[];
}

export interface QnaDraftInput {
  subject?: string | null;
  difficulty?: string | null;
  body: string;
}
export interface QnaDraftResult {
  body: string; // AI 초안 본문("AI 생성" 라벨과 함께 노출)
}

// ── 상담 요약 리포트(R3 · 녹음 브리핑 §4) ──
// 입력에 식별정보(이름·연락처)를 넣지 않는다. 산출물은 선생님 전건 검수용 "초안".
export interface ConsultSummaryInput {
  transcript: string;
  durationSec?: number | null;
  subject?: string | null; // 상담 카테고리/과목(있으면)
  scoreHint?: string | null; // janus_score 요지(읽기 전용 — 예: "종합 72점, 수학 취약")
}
export interface ConsultSummaryResult {
  covered: string[]; // 오늘 다룬 내용(3~6개)
  diagnosis: string; // 진단·관찰(2~4문장)
  nextActions: string[]; // 다음 액션(2~5개)
  demo?: boolean; // mock 산출물 표시
}

// ── 상담 요약 2뷰 생성(학생용/학부모용 — 발송·수신 레이어 브리핑 v1 §4) ──
// 원천(전사문 or 상담사 메모)에 없는 사실 생성 금지. 가격·상품 단정 금지(⛔). 본인 자녀 정보만.
export interface ConsultReportViewsInput {
  origin: 'audio' | 'fallback'; // 요약 원천 유형(감사·프롬프트 톤)
  covered: string[]; // 원천 요약: 다룬 내용
  diagnosis: string; // 원천 요약: 진단·관찰
  nextActions: string[]; // 원천 요약: 상담사가 실제 언급한 다음 액션(가격·상품 제외)
  subject?: string | null; // 상담 분야
}
export interface StudentReportView {
  covered: string[]; // 오늘 다룬 내용
  reviewPoints: string[]; // 복습 포인트
  nextLearning: string[]; // 다음 학습
}
export interface GuardianReportView {
  progress: string; // 진척 요지(2~4문장, 낙인·과장 없이)
  recommendedActions: string[]; // 권장 다음 액션(상담사 언급 한정, 가격·상품 단정 금지)
  effort: string; // 소요·권장(문장 — "다음 상담/과외를 권장드립니다" 수준까지, 단가 금지)
}
export interface ConsultReportViewsResult {
  student: StudentReportView;
  guardian: GuardianReportView;
  demo?: boolean;
}

export interface LlmProvider {
  reviewReport(input: ReportReviewInput): Promise<ReportReviewResult>;
  checkAnswerSimilarity(input: AnswerSimilarityInput): Promise<AnswerSimilarityResult>;
  /** Q&A 질문 → AI 1차 초안(Q3). 미구성/실패 시 예외 → 호출측에서 초안 생략(무해). */
  draftAnswer(input: QnaDraftInput): Promise<QnaDraftResult>;
  extractScoreReport(input: ScoreOcrInput): Promise<ScoreOcrResult>;
  analyzeConsulting(input: ConsultingAnalysisInput): Promise<ConsultingAnalysisResult>;
  /** 관문 자유서술 해석. 미구성/실패 시 예외 → 호출측(gateway)이 규칙 폴백. */
  interpretGateway(input: GatewayInterpretInput): Promise<GatewayLlmResult>;
  /** 상담 전사문 → 요약 리포트 초안(R3). 미구성/실패 시 예외 → 호출측이 재시도·수동 폴백. */
  consultSummary(input: ConsultSummaryInput): Promise<ConsultSummaryResult>;
  /** 요약 → 학생용/학부모용 2뷰(발송·수신 레이어). 미구성/실패 시 예외 → 호출측이 규칙 폴백. */
  consultReportViews(input: ConsultReportViewsInput): Promise<ConsultReportViewsResult>;
}
