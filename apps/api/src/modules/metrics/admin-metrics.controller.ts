import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { MetricsService } from './metrics.service';

/** 관측 지표(관리자·HR) — tutor_source 분해 등. 정산·운영에 개입하지 않는 읽기 전용. */
@Controller('admin/metrics')
export class AdminMetricsController {
  constructor(private readonly svc: MetricsService) {}

  /** GET /admin/metrics/tutor-source?days=90 — 완주·재결제·건당정산액 by 고용유형. */
  @Get('tutor-source')
  tutorSource(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    return this.svc.tutorSource(user, Number(days) || 90);
  }
}
