import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { BookingModule } from '../booking/booking.module';
import { AssignmentController } from './assignment.controller';
import { AssignmentService } from './assignment.service';

/** 전임 강제 배정 모듈(§근무시간 강제 배정) — 자동배정 대기열·채우기 배치. */
@Module({
  imports: [BookingModule, AvailabilityModule],
  controllers: [AssignmentController],
  providers: [AssignmentService],
  exports: [AssignmentService],
})
export class AssignmentModule {}
