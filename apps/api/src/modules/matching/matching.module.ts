import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { ReportModule } from '../report/report.module';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
import { DiagnosticMatchService } from './diagnostic-match.service';

/**
 * Matching 바운디드 컨텍스트 (CLAUDE.md §3).
 * MVP: 30분 자동매칭(availability 가용성 기반). 가이드 위저드/역상담은 추후.
 */
@Module({
  imports: [AvailabilityModule, ReportModule],
  controllers: [MatchingController],
  providers: [MatchingService, DiagnosticMatchService],
  exports: [MatchingService],
})
export class MatchingModule {}
