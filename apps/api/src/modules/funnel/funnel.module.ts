import { Module } from '@nestjs/common';
import { FunnelController } from './funnel.controller';
import { FunnelService } from './funnel.service';

/** 간이 전환 계측(W3·C3) — 자체 로그 테이블 기반 페이지·CTA 이벤트. */
@Module({
  controllers: [FunnelController],
  providers: [FunnelService],
  exports: [FunnelService], // 학원찾기 검색→리드 전환 계측(세션6)에서 재사용
})
export class FunnelModule {}
