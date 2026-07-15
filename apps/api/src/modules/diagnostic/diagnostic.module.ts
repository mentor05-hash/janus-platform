import { Module } from '@nestjs/common';
import { DiagnosticController } from './diagnostic.controller';
import { AdminDiagnosticController } from './admin-diagnostic.controller';
import { DiagnosticService } from './diagnostic.service';

/** 수준진단(진단 관문) — 문항 풀이→채점→유형별 약점→처방. 문제은행 데모(합성)+후속 kice. */
@Module({
  controllers: [DiagnosticController, AdminDiagnosticController],
  providers: [DiagnosticService],
  exports: [DiagnosticService],
})
export class DiagnosticModule {}
