import { Module } from '@nestjs/common';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

/**
 * Ops 바운디드 컨텍스트 (CLAUDE.md §3).
 * 운영 통계 대시보드 집계(관리자/HR). 응답 {data, meta} 규약.
 */
@Module({
  controllers: [OpsController],
  providers: [OpsService],
  exports: [OpsService],
})
export class OpsModule {}
