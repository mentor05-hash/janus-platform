import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SchoolRecordEventService } from './school-record-event.service';
import { SchoolRecordAppealService } from './school-record-appeal.service';
import { SchoolRecordGuardPolicyService } from './school-record-guard-policy.service';
import {
  AppealListQueryDto,
  BlockStatsQueryDto,
  SetConsultingToggleDto,
  UpdateAppealDto,
} from './dto/school-record-admin.dto';

/**
 * 생기부 가드 관리자 콘솔 (지시서 §6 스텝3) — 차단 통계·이의 큐·컨설팅 업로드 토글.
 * 전역 가드로 인증되며 **관리자만** 접근(RolesGuard). 토글 저장은 서비스에서 본사 마스터로 재제한.
 *
 * N37: 기본값이 `admin,hr` 이라 5개 경로가 HR 에게 열려 있었다. 대응 화면 `sr-guard` 는
 * 관리자 전용이고, 이의 큐에는 학생이 올린 생기부 관련 사유·처리 메모가 담긴다(PII).
 * 성적을 좁힌 O181 과 같은 이유로 좁힌다.
 */
@Controller('admin/school-record-guard')
@Roles('admin')
export class SchoolRecordAdminController {
  constructor(
    private readonly events: SchoolRecordEventService,
    private readonly appeals: SchoolRecordAppealService,
    private readonly policy: SchoolRecordGuardPolicyService,
  ) {}

  /** 차단 통계 — 사유 코드별·표면별 집계 + 총계 + 최근 차단. */
  @Get('stats')
  stats(@Query() q: BlockStatsQueryDto) {
    return this.events.stats({
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
    });
  }

  /** 이의 신고 큐 — 상태 필터 + 페이지네이션. */
  @Get('appeals')
  listAppeals(@Query() q: AppealListQueryDto) {
    return this.appeals.list(q);
  }

  /** 이의 상태 갱신(reviewing/resolved/rejected + 처리 메모). */
  @Patch('appeals/:id')
  updateAppeal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAppealDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.appeals.updateStatus(user, id, dto);
  }

  /** 컨설팅 업로드 토글 조회(현재 상태 + 예약 시각 + 자동활성 이력). */
  @Get('consulting-toggle')
  getToggle() {
    return this.policy.getConsultingUploadDisabled();
  }

  /** 컨설팅 업로드 토글 수동 on/off(본사 마스터). */
  @Put('consulting-toggle')
  setToggle(
    @Body() dto: SetConsultingToggleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.policy.setConsultingUploadDisabled(user, dto.enabled);
  }
}
