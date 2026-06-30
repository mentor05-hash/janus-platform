import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AccountRole } from '../../config/enums';
import { AvailabilityService } from './availability.service';
import {
  OfflineAvailabilityDto,
  WorkScheduleDto,
} from './dto/work-schedule.dto';

@Controller('teachers')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  /** GET /teachers/{id}/slots?date= — 가용 슬롯(버퍼·체류·근무 반영). */
  @Get(':id/slots')
  slots(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('date') date: string,
    @CurrentUser() user: AuthUser,
  ) {
    const studentId = user.role === AccountRole.STUDENT ? user.id : undefined;
    return this.availability.getDaySlots(id, date, studentId);
  }

  /** GET /teachers/{id}/work-schedule */
  @Get(':id/work-schedule')
  getWorkSchedule(@Param('id', ParseUUIDPipe) id: string) {
    return this.availability.getWorkSchedule(id);
  }

  /** PUT /teachers/{id}/work-schedule — 본인 또는 관리자/HR(소유권 검사). */
  @Put(':id/work-schedule')
  @Roles('teacher', 'admin', 'hr')
  putWorkSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WorkScheduleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.availability.putWorkSchedule(id, dto, user);
  }

  /** PUT /teachers/{id}/offline-availability — 오프라인 가능 센터·시간(본인/관리자). */
  @Put(':id/offline-availability')
  @Roles('teacher', 'admin', 'hr')
  putOfflineAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OfflineAvailabilityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.availability.putOfflineAvailability(id, dto, user);
  }
}
