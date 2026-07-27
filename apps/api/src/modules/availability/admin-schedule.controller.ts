import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AvailabilityService } from './availability.service';

/** 관리자: 선생님별 근무시간 일괄 업로드(아이디 매칭). */
@Controller('admin')
export class AdminScheduleController {
  constructor(private readonly availability: AvailabilityService) {}

  /** POST /admin/schedules/bulk — 여러 선생님 기본/주계획 일괄 적용. */
  @Post('schedules/bulk')
  @HttpCode(200)
  @Roles('admin')
  bulk(
    @Body()
    body: {
      items?: {
        loginId: string;
        recurringTemplate?: Record<string, { start: string; end: string }[]>;
        weekPlans?: {
          weekStart: string;
          template: Record<string, { start: string; end: string }[]>;
        }[];
      }[];
    },
    @CurrentUser() user: AuthUser,
  ) {
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Seoul',
    });
    return this.availability.bulkApplySchedules(
      { id: user.id, role: user.role, centerId: user.centerId },
      (body?.items ?? []) as never,
      today,
    );
  }
}
