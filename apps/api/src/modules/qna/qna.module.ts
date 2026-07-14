import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { PricingPolicyModule } from '../pricing-policy/pricing-policy.module';
import { LlmModule } from '../llm/llm.module';
import { BookingModule } from '../booking/booking.module';
import { AvailabilityModule } from '../availability/availability.module';
import { QnaController } from './qna.controller';
import { QnaService } from './qna.service';

/**
 * 온라인 Q&A 바운디드 컨텍스트 (CLAUDE.md §3 ext-qna, Phase 3).
 * 질문 건당 과금(billing/pricing), 공개질문 수임 게이트(§5-9), 채택→급여 적격.
 */
@Module({
  imports: [PricingPolicyModule, BillingModule, LlmModule, BookingModule, AvailabilityModule],
  controllers: [QnaController],
  providers: [QnaService],
  exports: [QnaService],
})
export class QnaModule {}
