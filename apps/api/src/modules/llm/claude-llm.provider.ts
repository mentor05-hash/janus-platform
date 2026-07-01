import { Logger } from '@nestjs/common';
import {
  AnswerSimilarityInput,
  AnswerSimilarityResult,
  LlmProvider,
  ReportReviewInput,
  ReportReviewResult,
  ScoreOcrInput,
  ScoreOcrResult,
} from './llm.types';

/**
 * 실모델(Claude 등) LlmProvider 자리표시자 (§9·§10).
 * API 키·모델이 정해지면 messages API 호출로 구현 교체. 현재는 명시적 실패.
 */
export class ClaudeLlmProvider implements LlmProvider {
  private readonly logger = new Logger('LlmProvider:claude');

  constructor(private readonly apiKey?: string) {
    this.logger.warn('ClaudeLlmProvider 는 자격증명 미구성 상태입니다(LLM_PROVIDER=mock 권장).');
  }

  reviewReport(_input: ReportReviewInput): Promise<ReportReviewResult> {
    throw new Error('실모델 AI 검토가 아직 구성되지 않았습니다(ANTHROPIC_API_KEY 필요).');
  }

  checkAnswerSimilarity(_input: AnswerSimilarityInput): Promise<AnswerSimilarityResult> {
    throw new Error('실모델 유사도 검사가 아직 구성되지 않았습니다(ANTHROPIC_API_KEY 필요).');
  }

  extractScoreReport(_input: ScoreOcrInput): Promise<ScoreOcrResult> {
    // 구성 시: Claude vision(messages API, image block)로 성적표 표를 구조화 추출.
    throw new Error('실 비전 OCR 이 아직 구성되지 않았습니다(ANTHROPIC_API_KEY 필요).');
  }
}
