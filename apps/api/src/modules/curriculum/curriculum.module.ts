import { Module } from '@nestjs/common';
import { DiagnosticModule } from '../diagnostic/diagnostic.module';
import { CurriculumController } from './curriculum.controller';
import { CurriculumService } from './curriculum.service';

/** 주간 학습 플랜 — 진단(약점) + 성적 → 처방 카드. DiagnosticService 재사용. */
@Module({
  imports: [DiagnosticModule],
  controllers: [CurriculumController],
  providers: [CurriculumService],
})
export class CurriculumModule {}
