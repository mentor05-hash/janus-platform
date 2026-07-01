import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClaudeLlmProvider } from './claude-llm.provider';
import { MockLlmProvider } from './mock-llm.provider';
import { LLM_PROVIDER } from './llm.types';

/**
 * 공유 LlmProvider 어댑터 (CLAUDE.md §9·§10) — 신고 검토·답변 유사도.
 * ENV LLM_PROVIDER: claude → 실모델 stub(자격증명 필요) / 그 외 → mock 휴리스틱.
 * report·qna 등에서 LLM_PROVIDER 주입.
 */
@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const which = config.get<string>('LLM_PROVIDER') ?? 'mock';
        switch (which) {
          case 'claude':
            return new ClaudeLlmProvider(config.get<string>('ANTHROPIC_API_KEY'));
          default:
            return new MockLlmProvider();
        }
      },
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
