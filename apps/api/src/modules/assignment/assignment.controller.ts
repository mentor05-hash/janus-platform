import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ConsultMode, ConsultType } from '../../config/enums';
import { AssignmentService } from './assignment.service';

class AutoAssignDto {
  @IsIn(['담임', '교과', '입시', '심리'])
  consultType!: ConsultType;

  @IsOptional()
  @IsIn(['chat', 'zoom', 'hand', 'offline'])
  mode?: ConsultMode;

  @IsOptional()
  @IsString()
  subType?: string;
}

@Controller('assignment')
export class AssignmentController {
  constructor(private readonly svc: AssignmentService) {}

  /** POST /assignment/auto-request — 학생: 자동배정 신청(시간 미지정, 전임 근무시간에 배정). */
  @Post('auto-request')
  @Roles('student')
  request(@CurrentUser() user: AuthUser, @Body() dto: AutoAssignDto) {
    return this.svc.requestAutoAssign(user, dto);
  }

  /** GET /assignment/auto-request — 학생: 내 자동배정 신청 현황. */
  @Get('auto-request')
  @Roles('student')
  mine(@CurrentUser() user: AuthUser) {
    return this.svc.myRequests(user);
  }

  /** DELETE /assignment/auto-request/{id} — 학생: 대기 신청 취소. */
  @Delete('auto-request/:id')
  @Roles('student')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.svc.cancelRequest(user, id);
  }

  /** POST /assignment/run-fill — 관리자: 전임 자동배정 채우기 즉시 실행(운영/점검). */
  @Post('run-fill')
  @Roles('admin')
  runFill() {
    return this.svc.runFill();
  }
}
