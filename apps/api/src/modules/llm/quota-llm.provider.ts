import { HttpException, HttpStatus } from '@nestjs/common';
import { QuotaExceededError, UsageQuota } from '../../common/quota/usage-quota';
import {
  AnswerSimilarityInput,
  AnswerSimilarityResult,
  ConsultingAnalysisInput,
  ConsultingAnalysisResult,
  LlmProvider,
  LLM_PURPOSES,
  LlmPurpose,
  ReportReviewInput,
  ReportReviewResult,
  ScoreOcrInput,
  ScoreOcrResult,
} from './llm.types';

/**
 * 유료 LlmProvider 를 감싸 일 호출 상한을 강제한다(실행계획서 §비용 — 공개 전 하드 게이트).
 * 어댑터 경계에서 막으므로 호출자(관문 홈·Q&A 초안·진단서·컨설팅 분석)가 늘어도 자동 보호된다.
 * 비용이 0인 mock 어댑터는 감싸지 않는다(LlmModule 참조).
 */
export class QuotaLlmProvider implements LlmProvider {
  constructor(
    private readonly inner: LlmProvider,
    private readonly quota: UsageQuota,
    /** 용도별 일 상한. 0 이하면 해당 용도 무제한 */
    private readonly limits: Record<LlmPurpose, number>,
    /** 전 용도 합산 일 상한 — 개별 상한을 다 더한 값보다 낮게 잡아 총액을 통제 */
    private readonly totalLimit: number,
  ) {}

  private async guard<T>(purpose: LlmPurpose, run: () => Promise<T>): Promise<T> {
    try {
      await this.quota.consume('total', this.totalLimit);
      await this.quota.consume(purpose, this.limits[purpose]);
    } catch (e) {
      if (e instanceof QuotaExceededError) throw toHttp(e);
      throw e;
    }
    return run();
  }

  reviewReport(input: ReportReviewInput): Promise<ReportReviewResult> {
    return this.guard('report', () => this.inner.reviewReport(input));
  }

  checkAnswerSimilarity(input: AnswerSimilarityInput): Promise<AnswerSimilarityResult> {
    return this.guard('similarity', () => this.inner.checkAnswerSimilarity(input));
  }

  extractScoreReport(input: ScoreOcrInput): Promise<ScoreOcrResult> {
    return this.guard('ocr', () => this.inner.extractScoreReport(input));
  }

  analyzeConsulting(input: ConsultingAnalysisInput): Promise<ConsultingAnalysisResult> {
    return this.guard('consulting', () => this.inner.analyzeConsulting(input));
  }

  /** 관리자 사용량 조회 — 증가 없이 오늘 값만. */
  async usage(): Promise<{ total: number; totalLimit: number; byPurpose: Record<string, { used: number; limit: number }> }> {
    const byPurpose: Record<string, { used: number; limit: number }> = {};
    for (const p of LLM_PURPOSES) {
      byPurpose[p] = { used: await this.quota.peek(p), limit: this.limits[p] };
    }
    return { total: await this.quota.peek('total'), totalLimit: this.totalLimit, byPurpose };
  }
}

/**
 * 상한 초과 → 503. 사용자에게는 "일시적으로 AI 를 쓸 수 없다"는 뜻만 전달하고,
 * 남은 횟수·상한 같은 운영 수치는 노출하지 않는다.
 */
export function toHttp(e: QuotaExceededError): HttpException {
  return new HttpException(
    {
      error: {
        code: 'AI_QUOTA_EXCEEDED',
        message: e.counterUnavailable
          ? 'AI 기능을 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.'
          : '오늘 AI 사용량을 모두 사용했습니다. 내일 다시 시도해 주세요.',
      },
    },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}
