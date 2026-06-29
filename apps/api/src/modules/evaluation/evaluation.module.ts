import { Module } from '@nestjs/common';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './evaluation.service';

/**
 * Evaluation 바운디드 컨텍스트 (CLAUDE.md §3, Phase 3).
 * 분류(fit/unfit §5-9)·리뷰·평점 집계·등급(S/A/B).
 */
@Module({
  controllers: [EvaluationController],
  providers: [EvaluationService],
  exports: [EvaluationService],
})
export class EvaluationModule {}
