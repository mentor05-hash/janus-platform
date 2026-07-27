import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
    @Query('mode') mode: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    const studentId = user.role === AccountRole.STUDENT ? user.id : undefined;
    // mode 를 주면 그 상담 방식이 불가능한 날은 빈 배열이 온다(환경 인지 매칭 O120).
    // 안 주면 기존과 동일하게 동작한다 — 소비처 6곳의 계약을 바꾸지 않기 위해서다.
    return this.availability.getDaySlots(id, date, studentId, mode);
  }

  /**
   * GET /teachers/{id}/consult-modes?date= — 그 날 가능한 상담 모드 + 상품별 예약 가능 여부.
   * 슬롯이 왜 비었는지 화면이 설명할 수 있게 한다(빈 목록만 주면 막다른 길이 된다).
   */
  @Get(':id/consult-modes')
  consultModes(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('date') date: string,
    @CurrentUser() user: AuthUser,
  ) {
    const studentId = user.role === AccountRole.STUDENT ? user.id : undefined;
    return this.availability.getConsultModes(id, date, studentId);
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

  /** GET /teachers/{id}/week-plans — 주별 근무 계획 + 기본 템플릿. */
  @Get(':id/week-plans')
  @Roles('teacher', 'admin', 'hr')
  getWeekPlans(@Param('id', ParseUUIDPipe) id: string) {
    return this.availability.getWeekPlans(id);
  }

  /** PUT /teachers/{id}/week-plans — 다음 주 이후 근무 계획 저장(최대 8주). */
  @Put(':id/week-plans')
  @Roles('teacher', 'admin', 'hr')
  saveWeekPlans(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { weekPlans?: unknown },
    @CurrentUser() user: AuthUser,
  ) {
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Seoul',
    });
    return this.availability.saveWeekPlans(
      id,
      (body?.weekPlans ?? []) as never,
      user,
      today,
    );
  }

  /** POST /teachers/{id}/week-plans/conflicts — 저장 전 학생 예약 충돌 검사. */
  @Post(':id/week-plans/conflicts')
  @HttpCode(200)
  @Roles('teacher', 'admin', 'hr')
  weekPlanConflicts(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { weekPlans?: unknown },
  ) {
    return this.availability.detectConflicts(
      id,
      (body?.weekPlans ?? []) as never,
    );
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

  /** GET /teachers/{id}/offline-availability — 현재 오프라인 가능 설정(본인/관리자). */
  @Get(':id/offline-availability')
  @Roles('teacher', 'admin', 'hr')
  getOfflineAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.availability.getOfflineAvailability(id, user);
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
