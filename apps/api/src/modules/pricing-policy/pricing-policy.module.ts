import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';

/**
 * PricingPolicy 바운디드 컨텍스트 (CLAUDE.md §3).
 * 요금 단일 소스(§5-2). Phase 1 은 읽기 슬라이스(PricingService) — booking/quote 가 의존.
 */
@Module({
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingPolicyModule {}
