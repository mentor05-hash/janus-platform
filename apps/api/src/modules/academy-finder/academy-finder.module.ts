import { Module } from '@nestjs/common';
import { AcademyController, AcademyAdminController } from './academy.controller';
import { AcademyService } from './academy.service';
import { PublicSyncService } from './public-sync.service';

/**
 * 학원찾기(academy finder) v2 — 진단→처방 관문 밖 통학·성적대 기반 학원 탐색.
 * 세션 1: 스키마·공공 적재·provenance. 검색 정렬(세션2)·클레임(세션3)·집계(세션4)는 후속.
 */
@Module({
  controllers: [AcademyController, AcademyAdminController],
  providers: [AcademyService, PublicSyncService],
  exports: [AcademyService, PublicSyncService],
})
export class AcademyFinderModule {}
