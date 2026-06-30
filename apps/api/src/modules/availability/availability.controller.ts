import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AccountRole } from '../../config/enums';
import { AvailabilityService } from './availability.service';
import {
  LeaveDto,
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

  /** GET /teachers/{id}/leave — 사유 제외(연차/반차/병가) 목록. */
  @Get(':id/leave')
  @Roles('teacher', 'admin', 'hr')
  listLeave(@Param('id', ParseUUIDPipe) id: string) {
    return this.availability.listLeave(id);
  }

  /** POST /teachers/{id}/leave — 사유 제외 등록(본인/관리자). */
  @Post(':id/leave')
  @Roles('teacher', 'admin', 'hr')
  addLeave(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LeaveDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.availability.addLeave(id, dto, user);
  }

  /** DELETE /teachers/{id}/leave/{date} — 사유 제외 해제(본인/관리자). */
  @Delete(':id/leave/:date')
  @Roles('teacher', 'admin', 'hr')
  removeLeave(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('date') date: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.availability.removeLeave(id, date, user);
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
