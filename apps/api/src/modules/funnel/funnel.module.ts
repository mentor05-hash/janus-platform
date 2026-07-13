import { Module } from '@nestjs/common';
import { FunnelController } from './funnel.controller';
import { FunnelService } from './funnel.service';

/** 간이 전환 계측(W3·C3) — 자체 로그 테이블 기반 페이지·CTA 이벤트. */
@Module({
  controllers: [FunnelController],
  providers: [FunnelService],
})
export class FunnelModule {}
