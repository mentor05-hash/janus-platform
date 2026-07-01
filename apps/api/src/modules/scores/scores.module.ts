import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { LlmModule } from '../llm/llm.module';
import { ScoresController } from './scores.controller';
import { ScoresService } from './scores.service';

/** 성적 업로드 — 엑셀 일괄·수동·OCR + 미업로드 학생 조회. */
@Module({
  imports: [StorageModule, LlmModule],
  controllers: [ScoresController],
  providers: [ScoresService],
})
export class ScoresModule {}
