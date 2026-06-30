import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/**
 * Dashboard 바운디드 컨텍스트 (CLAUDE.md §evaluation·ops 확장).
 * 평가/순위·센터비교(z-score)·5피벗. §D 권한 매트릭스 강제. 응답 {data, meta} 규약.
 */
@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
