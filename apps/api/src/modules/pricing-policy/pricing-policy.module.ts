import { Module } from '@nestjs/common';
import { AdminPolicyController } from './admin-policy.controller';
import { AdminPolicyService } from './admin-policy.service';
import { PricingService } from './pricing.service';

/**
 * PricingPolicy 바운디드 컨텍스트 (CLAUDE.md §3).
 * 요금 단일 소스(§5-2) + 관리자 정책 편집(요금/한도/기능토글, §5-8/9). booking/quote 가 의존.
 */
@Module({
  controllers: [AdminPolicyController],
  providers: [PricingService, AdminPolicyService],
  exports: [PricingService, AdminPolicyService],
})
export class PricingPolicyModule {}
