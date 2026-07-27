import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { LeadService } from './lead.service';
import { LeadSubmitDto } from './dto/lead.dto';

/** 상담 신청(리드) — 학생. 신청·내 신청 조회. 전달 정보는 요약+동의 범위만(§4). */
@Controller()
@Roles('student')
export class LeadController {
  constructor(private readonly svc: LeadService) {}

  /** GET /leads/preview — 공유 가능 요약 미리보기(이름·학년·목표). 성적 상세 없음. */
  @Get('leads/preview')
  preview(@CurrentUser() user: AuthUser) {
    return this.svc.preview(user);
  }

  /** GET /leads/mine — 내 상담 신청(상태·응답). */
  @Get('leads/mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.svc.mine(user);
  }

  /** POST /academies/:academyId/leads — 상담 신청. */
  @Post('academies/:academyId/leads')
  submit(
    @CurrentUser() user: AuthUser,
    @Param('academyId') academyId: string,
    @Body() dto: LeadSubmitDto,
  ) {
    return this.svc.submit(user, academyId, dto);
  }
}
