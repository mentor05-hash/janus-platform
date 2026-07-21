import { Module } from '@nestjs/common';
import { AcademyController, AcademyAdminController } from './academy.controller';
import { AcademyService } from './academy.service';
import { PublicSyncService } from './public-sync.service';
import { ClaimController, ClaimAdminController } from './claim.controller';
import { ClaimService } from './claim.service';
import { DongResolver } from './dong-resolver';
import { EnrollmentController } from './enrollment.controller';
import { EnrollmentService } from './enrollment.service';
import { CohortAggregateService } from './cohort-aggregate.service';

/**
 * 학원찾기(academy finder) v2 — 진단→처방 관문 밖 통학·성적대 기반 학원 탐색.
 * 세션 1: 스키마·공공적재·provenance / 2: 검색·§5 정렬 / 3: 클레임·반·버스 /
 * 4: 재원생 동의·분기 집계(verified·k≥5). 리드·화면(세션5)은 후속.
 */
@Module({
  controllers: [AcademyController, AcademyAdminController, ClaimController, ClaimAdminController, EnrollmentController],
  providers: [AcademyService, PublicSyncService, ClaimService, DongResolver, EnrollmentService, CohortAggregateService],
  exports: [AcademyService, PublicSyncService, ClaimService, EnrollmentService, CohortAggregateService],
})
export class AcademyFinderModule {}
