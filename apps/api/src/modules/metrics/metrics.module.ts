import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsInterceptor } from '../../common/observability/metrics.interceptor';
import { MetricsController } from './metrics.controller';
import { AdminMetricsController } from './admin-metrics.controller';
import { MetricsService } from './metrics.service';

/** 관측성 — Prometheus /metrics + 전역 요청 메트릭 인터셉터(§10) + 관리자 지표(tutor_source 분해). */
@Module({
  controllers: [MetricsController, AdminMetricsController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }, MetricsService],
})
export class MetricsModule {}
