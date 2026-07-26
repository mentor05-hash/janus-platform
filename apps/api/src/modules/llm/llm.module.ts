import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_PROVIDER, CacheProvider } from '../../common/cache/cache.types';
import { envInt, UsageQuota } from '../../common/quota/usage-quota';
import { ClaudeLlmProvider } from './claude-llm.provider';
import { MockLlmProvider } from './mock-llm.provider';
import { QuotaLlmProvider } from './quota-llm.provider';
import { LLM_PROVIDER, LlmPurpose } from './llm.types';

/**
 * 공유 LlmProvider 어댑터 (CLAUDE.md §9·§10) — 신고 검토·답변 유사도.
 * ENV LLM_PROVIDER: claude → 실모델 stub(자격증명 필요, **일 호출 상한 강제**) / 그 외 → mock 휴리스틱.
 * report·qna 등에서 LLM_PROVIDER 주입.
 */

// 용도별 기본 일 상한 — 1인 운영 초기 규모 기준. 실사용 추이를 보고 ENV 로 올린다.
//   similarity 는 답변마다 걸려 호출 수가 가장 많고, ocr·consulting 은 1인당 1~2회로 끝나지만
//   이미지·긴 프롬프트라 호출당 단가가 높다.
const DEFAULT_LIMITS: Record<LlmPurpose, number> = {
  report: 100,
  similarity: 300,
  ocr: 100,
  consulting: 60,
};
// 합산 상한은 개별 합(560)보다 낮게 — 한 용도가 몰아 써도 총액이 먼저 막힌다.
const DEFAULT_TOTAL_LIMIT = 400;

@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService, CACHE_PROVIDER],
      useFactory: (config: ConfigService, cache: CacheProvider) => {
        const which = config.get<string>('LLM_PROVIDER') ?? 'mock';
        if (which !== 'claude') return new MockLlmProvider(); // mock 은 비용 0 — 상한 불필요

        const inner = new ClaudeLlmProvider(
          config.get<string>('ANTHROPIC_API_KEY'),
          config.get<string>('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-6',
        );
        const limits = { ...DEFAULT_LIMITS };
        for (const p of Object.keys(limits) as LlmPurpose[]) {
          limits[p] = envInt(
            config.get<string>(`LLM_DAILY_LIMIT_${p.toUpperCase()}`),
            limits[p],
          );
        }
        const total = envInt(
          config.get<string>('LLM_DAILY_CALL_LIMIT'),
          DEFAULT_TOTAL_LIMIT,
        );
        // 카운터 장애 시 기본은 차단(fail closed) — 비용 폭주가 AI 일시 중단보다 큰 리스크.
        const failOpen = config.get<string>('LLM_QUOTA_FAIL_OPEN') === 'true';
        if (config.get<string>('CACHE_PROVIDER') !== 'redis') {
          new Logger('LlmModule').warn(
            'LLM 상한 카운터가 in-process 메모리입니다 — 다중 인스턴스에서는 상한이 인스턴스별로 따로 셉니다(CACHE_PROVIDER=redis 권장).',
          );
        }
        return new QuotaLlmProvider(
          inner,
          new UsageQuota(cache, 'llm', failOpen),
          limits,
          total,
        );
      },
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
