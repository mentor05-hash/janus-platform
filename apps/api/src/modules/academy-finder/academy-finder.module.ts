import { Module } from '@nestjs/common';
import { AcademyController, AcademyAdminController } from './academy.controller';
import { AcademyService } from './academy.service';
import { PublicSyncService } from './public-sync.service';
import { ClaimController, ClaimAdminController } from './claim.controller';
import { ClaimService } from './claim.service';
import { DongResolver } from './dong-resolver';

/**
 * 학원찾기(academy finder) v2 — 진단→처방 관문 밖 통학·성적대 기반 학원 탐색.
 * 세션 1: 스키마·공공 적재·provenance / 세션 2: 검색·필터·§5 정렬 / 세션 3: 클레임·반·버스 편집.
 * 재원생 집계(세션4)·리드·화면(세션5)은 후속.
 */
@Module({
  controllers: [AcademyController, AcademyAdminController, ClaimController, ClaimAdminController],
  providers: [AcademyService, PublicSyncService, ClaimService, DongResolver],
  exports: [AcademyService, PublicSyncService, ClaimService],
})
export class AcademyFinderModule {}
