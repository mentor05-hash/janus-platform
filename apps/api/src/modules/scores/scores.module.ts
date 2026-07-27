import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { LlmModule } from '../llm/llm.module';
import { SchoolRecordGuardModule } from '../guard/school-record-guard.module';
import { GuardianConsentModule } from '../guardian-consent/guardian-consent.module';
import { ScoresController, ScoresMeController } from './scores.controller';
import { ScoresService } from './scores.service';

/** 성적 업로드 — 엑셀 일괄·수동·OCR + 미업로드 학생 조회 + 학생/학부모 조회. */
@Module({
  imports: [
    StorageModule,
    LlmModule,
    SchoolRecordGuardModule,
    GuardianConsentModule,
  ],
  controllers: [ScoresController, ScoresMeController],
  providers: [ScoresService],
})
export class ScoresModule {}
