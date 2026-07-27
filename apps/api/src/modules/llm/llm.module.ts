import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_PROVIDER, CacheProvider } from '../../common/cache/cache.types';
import { envInt, UsageQuota } from '../../common/quota/usage-quota';
import { ClaudeLlmProvider } from './claude-llm.provider';
import { MockLlmProvider } from './mock-llm.provider';
import { QuotaLlmProvider } from './quota-llm.provider';
import { LLM_PROVIDER, LlmPurpose } from './llm.types';
import {
  LEGACY_LIMIT_ENV_KEY,
  LLM_DEFAULT_LIMITS,
  LLM_DEFAULT_TOTAL_LIMIT,
  llmDailyLimitEnvKey,
} from './llm.limits';
import {
  AI_USAGE_DEFAULT,
  RESERVED_PURPOSES,
  discretionaryTotalLimit,
} from '../pricing-policy/domain/ai-usage-policy';

/**
 * 공유 LlmProvider 어댑터 (CLAUDE.md §9·§10) — 신고 검토·답변 유사도.
 * ENV LLM_PROVIDER: claude → 실모델 stub(자격증명 필요, **일 호출 상한 강제**) / 그 외 → mock 휴리스틱.
 * report·qna 등에서 LLM_PROVIDER 주입.
 */

// 상한 기본값은 llm.limits.ts 가 단일 소스다(정합 검사와 공유 — B221 3층).

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
        const limits = { ...LLM_DEFAULT_LIMITS };
        for (const p of Object.keys(limits) as LlmPurpose[]) {
          // 신규 키 우선 → 없으면 구 키(운영 설정 존중) → 없으면 기본값
          const legacyKey = LEGACY_LIMIT_ENV_KEY[p];
          const legacy = legacyKey
            ? envInt(config.get<string>(legacyKey), limits[p])
            : limits[p];
          limits[p] = envInt(config.get<string>(llmDailyLimitEnvKey(p)), legacy);
        }
        const total = envInt(
          config.get<string>('LLM_DAILY_CALL_LIMIT'),
          LLM_DEFAULT_TOTAL_LIMIT,
        );
        // 카운터 장애 시 기본은 차단(fail closed) — 비용 폭주가 AI 일시 중단보다 큰 리스크.
        const failOpen = config.get<string>('LLM_QUOTA_FAIL_OPEN') === 'true';
        if (config.get<string>('CACHE_PROVIDER') !== 'redis') {
          new Logger('LlmModule').warn(
            'LLM 상한 카운터가 in-process 메모리입니다 — 다중 인스턴스에서는 상한이 인스턴스별로 따로 셉니다(CACHE_PROVIDER=redis 권장).',
          );
        }
        // 2층 예약분(B221) — 매출 연동 용도가 재량 호출에 굶지 않게 합산 상한을 쪼갠다.
        // 비율은 DB 정책(ai_usage_policy)으로도 바꿀 수 있지만, 어댑터는 부팅 시점에
        // 만들어지므로 여기서는 ENV/기본값을 쓴다(운영 중 조정은 ENV + 재시작).
        const reservePct = Number(
          config.get<string>('LLM_ENTITLED_RESERVE_PCT') ??
            AI_USAGE_DEFAULT.reservePctForEntitled,
        );
        const discretionary = discretionaryTotalLimit(
          total,
          Number.isFinite(reservePct)
            ? reservePct
            : AI_USAGE_DEFAULT.reservePctForEntitled,
        );
        return new QuotaLlmProvider(
          inner,
          new UsageQuota(cache, 'llm', failOpen),
          limits,
          total,
          RESERVED_PURPOSES,
          discretionary,
        );
      },
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
