import { Module } from '@nestjs/common';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { MembershipController } from './membership.controller';
import { MembershipService } from './membership.service';

/**
 * Membership 바운디드 컨텍스트 (CLAUDE.md §3).
 * 회원 등급·구독 플랜·구독 가입. 구독 → 등급 → 주간부여(billing) 연동(§5-3).
 * 구독 번들: 플랜 포함 상품(배치표 등)을 구독 시 자동 부여(EntitlementService).
 */
@Module({
  imports: [EntitlementModule],
  controllers: [MembershipController],
  providers: [MembershipService],
  exports: [MembershipService],
})
export class MembershipModule {}
