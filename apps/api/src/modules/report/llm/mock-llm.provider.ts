import { Injectable, Logger } from '@nestjs/common';
import { LlmProvider, ReportReviewInput, ReportReviewResult } from './llm.types';

/** 로컬 stub LLM. 심각 키워드 휴리스틱으로 1차 플래그(실제 모델 연동 전 자리표시). */
@Injectable()
export class MockLlmProvider implements LlmProvider {
  private readonly logger = new Logger('LlmProvider:mock');
  private static readonly SEVERE = ['폭언', '욕설', '성희롱', '사기', '폭력'];

  async reviewReport(input: ReportReviewInput): Promise<ReportReviewResult> {
    const flagged = MockLlmProvider.SEVERE.some((k) => (input.reason ?? '').includes(k));
    this.logger.log(`[stub] review target=${input.targetType} flagged=${flagged}`);
    return {
      flagged,
      summary: flagged ? '자동 검토: 위반 소지 있음(관리자 확인 필요)' : '자동 검토: 특이사항 없음',
      suggestedAction: flagged ? 'suspend' : 'none',
    };
  }
}
