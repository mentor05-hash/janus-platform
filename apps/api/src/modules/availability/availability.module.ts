import { Module } from '@nestjs/common';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';

/**
 * Availability 바운디드 컨텍스트 (CLAUDE.md §3).
 * 근무 캘린더·슬롯(휴게 버퍼 §5-1)·차단. matching/booking 이 가용성 판정에 의존.
 */
@Module({
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
