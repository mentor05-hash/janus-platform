import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { SchoolRecordAppealService } from './school-record-appeal.service';
import { CreateAppealDto } from './dto/school-record-admin.dto';

/**
 * 생기부 차단 이의 접수(§4-b 이의 경로) — 로그인 사용자 누구나.
 * 관리자 열람/처리는 admin/school-record-guard 컨트롤러에 분리(권한 경계).
 */
@Controller('school-record-guard')
export class SchoolRecordAppealController {
  constructor(private readonly appeals: SchoolRecordAppealService) {}

  /** 이의 신고 접수 — 사유 코드 + 본인 문장. 파일 미첨부(무취급). */
  @Post('appeals')
  create(@Body() dto: CreateAppealDto, @CurrentUser() user: AuthUser) {
    return this.appeals.create(user, dto);
  }
}
