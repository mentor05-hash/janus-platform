import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlockService } from './block.service';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { MockLlmProvider } from './llm/mock-llm.provider';
import { LLM_PROVIDER } from './llm/llm.types';

/**
 * 신고·차단·AI 검토 (CLAUDE.md §3 ext-report, Phase 3).
 * LlmProvider 어댑터(ENV LLM_PROVIDER, 현재 mock). 차단은 matching/booking 이 참조.
 */
@Module({
  controllers: [ReportController],
  providers: [
    ReportService,
    BlockService,
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const which = config.get<string>('LLM_PROVIDER') ?? 'none';
        switch (which) {
          // case 'claude': return new ClaudeLlmProvider(...); // 후결합
          default:
            return new MockLlmProvider();
        }
      },
    },
  ],
  exports: [BlockService],
})
export class ReportModule {}
