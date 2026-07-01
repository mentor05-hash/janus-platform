import { Module } from '@nestjs/common';
import { BlockService } from './block.service';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { LlmModule } from '../llm/llm.module';

/**
 * 신고·차단·AI 검토 (CLAUDE.md §3 ext-report, Phase 3).
 * LlmProvider 는 공유 LlmModule(ENV LLM_PROVIDER). 차단은 matching/booking 이 참조.
 */
@Module({
  imports: [LlmModule],
  controllers: [ReportController],
  providers: [ReportService, BlockService],
  exports: [BlockService],
})
export class ReportModule {}
