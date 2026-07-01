import { Injectable, Logger } from '@nestjs/common';
import {
  AnswerSimilarityInput,
  AnswerSimilarityResult,
  LlmProvider,
  ReportReviewInput,
  ReportReviewResult,
} from './llm.types';

/**
 * 로컬 stub LLM — 실모델 연동 전 자리표시.
 * - 신고: 키워드 휴리스틱(심각/경미 2단계 + 분류)
 * - 답변 유사도: 토큰 Jaccard(문자 3-gram 병용)로 표절·중복 답변 1차 탐지
 */
@Injectable()
export class MockLlmProvider implements LlmProvider {
  private readonly logger = new Logger('LlmProvider:mock');

  // 심각(정지 권고) / 경미(경고 권고) 키워드
  private static readonly SEVERE: Record<string, string[]> = {
    성희롱: ['성희롱', '성추행', '몸매', '스킨십'],
    폭력: ['폭력', '폭행', '때리', '협박'],
    사기: ['사기', '환불 안', '돈 떼', '입금만'],
    욕설: ['욕설', '폭언', '씨발', '개새'],
  };
  private static readonly MINOR = ['불친절', '지각', '무성의', '연락 두절', '반말'];

  async reviewReport(input: ReportReviewInput): Promise<ReportReviewResult> {
    const text = input.reason ?? '';
    let category: string | undefined;
    for (const [cat, kws] of Object.entries(MockLlmProvider.SEVERE)) {
      if (kws.some((k) => text.includes(k))) { category = cat; break; }
    }
    const minor = !category && MockLlmProvider.MINOR.some((k) => text.includes(k));
    const severity: ReportReviewResult['severity'] = category ? 'high' : minor ? 'low' : 'none';
    this.logger.log(`[stub] review target=${input.targetType} severity=${severity} category=${category ?? '-'}`);
    return {
      flagged: severity !== 'none',
      severity,
      category,
      summary:
        severity === 'high' ? `자동 검토: ${category} 위반 소지(관리자 즉시 확인 필요)`
        : severity === 'low' ? '자동 검토: 경미 사안(경고 검토)'
        : '자동 검토: 특이사항 없음',
      suggestedAction: severity === 'high' ? 'suspend' : severity === 'low' ? 'warn' : 'none',
    };
  }

  async checkAnswerSimilarity(input: AnswerSimilarityInput): Promise<AnswerSimilarityResult> {
    const a = MockLlmProvider.norm(input.body);
    let best = 0, bestId: string | undefined;
    for (const p of input.priors) {
      const sim = MockLlmProvider.similarity(a, MockLlmProvider.norm(p.body));
      if (sim > best) { best = sim; bestId = p.id; }
    }
    const flagged = best >= 0.6; // 60%↑ 유사 → 중복/표절 소지
    this.logger.log(`[stub] similarity max=${best.toFixed(2)} flagged=${flagged}`);
    return {
      flagged,
      maxSimilarity: Math.round(best * 100) / 100,
      similarToId: flagged ? bestId : undefined,
      summary: flagged
        ? `기존 답변과 ${Math.round(best * 100)}% 유사 — 중복/표절 여부 확인 권장`
        : '유사 답변 없음',
    };
  }

  private static norm(s: string): string {
    return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  }
  // 단어 Jaccard와 문자 3-gram Jaccard의 평균
  private static similarity(a: string, b: string): number {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const wj = MockLlmProvider.jaccard(new Set(a.split(' ')), new Set(b.split(' ')));
    const cj = MockLlmProvider.jaccard(MockLlmProvider.ngrams(a, 3), MockLlmProvider.ngrams(b, 3));
    return (wj + cj) / 2;
  }
  private static ngrams(s: string, n: number): Set<string> {
    const g = new Set<string>();
    const t = s.replace(/ /g, '');
    for (let i = 0; i + n <= t.length; i++) g.add(t.slice(i, i + n));
    return g;
  }
  private static jaccard(a: Set<string>, b: Set<string>): number {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    return inter / (a.size + b.size - inter);
  }
}
