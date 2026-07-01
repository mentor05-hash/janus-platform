import { Module } from '@nestjs/common';
import { AdminInfraController } from './admin-infra.controller';
import { AdminInfraService } from './admin-infra.service';
import { AvailabilityController } from './availability.controller';
import { AdminScheduleController } from './admin-schedule.controller';
import { AvailabilityService } from './availability.service';

/**
 * Availability 바운디드 컨텍스트 (CLAUDE.md §3).
 * 근무 캘린더·슬롯(휴게 버퍼 §5-1)·차단·줌·상담실. matching/booking 이 가용성 판정에 의존.
 */
@Module({
  controllers: [AvailabilityController, AdminInfraController, AdminScheduleController],
  providers: [AvailabilityService, AdminInfraService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
