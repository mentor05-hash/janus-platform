import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsInterceptor } from '../../common/observability/metrics.interceptor';
import { MetricsController } from './metrics.controller';

/** 관측성 — Prometheus /metrics + 전역 요청 메트릭 인터셉터(§10). */
@Module({
  controllers: [MetricsController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }],
})
export class MetricsModule {}
