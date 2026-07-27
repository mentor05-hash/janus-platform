import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminStatsService } from './admin-stats.service';

@Controller('admin/stats')
export class AdminStatsController {
  constructor(private readonly stats: AdminStatsService) {}

  /** GET /admin/stats/overview — 진단·강좌·커뮤니티 핵심 지표(관리자 전용 · O128). */
  @Get('overview')
  @Roles('admin')
  overview() {
    return this.stats.overview();
  }
}
