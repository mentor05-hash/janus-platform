import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { metricsRegistry } from '../../common/observability/metrics';

@Controller()
export class MetricsController {
  /** GET /metrics — Prometheus 스크레이프(공개, 프로세스+HTTP 지표). res 직접 전송으로 래핑 우회. */
  @Public()
  @Get('metrics')
  async metrics(@Res() res: Response): Promise<void> {
    res.set('Content-Type', metricsRegistry.contentType);
    res.send(await metricsRegistry.metrics());
  }
}
