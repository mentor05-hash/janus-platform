import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { BillingModule } from '../billing/billing.module';
import { PricingPolicyModule } from '../pricing-policy/pricing-policy.module';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';

/**
 * Booking 바운디드 컨텍스트 (CLAUDE.md §3).
 * 예약 quote·상태머신(§5-4)·시간대(휴게 버퍼 §5-1 재검증)·크레딧 차감(§5-3).
 */
@Module({
  imports: [AvailabilityModule, PricingPolicyModule, BillingModule],
  controllers: [BookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
