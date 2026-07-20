import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { ConsultReportService } from './consult-report.service';

class ReportUpdateDto {
  @IsOptional() @IsArray() @IsString({ each: true }) covered?: string[];
  @IsOptional() @IsString() diagnosis?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) nextActions?: string[];
}

/** R4 상담 요약 리포트 — 선생님 검수함(초안→승인→발송) + 학생 열람. */
@Controller('media/reports')
export class ConsultReportController {
  constructor(private readonly svc: ConsultReportService) {}

  /** GET /media/reports/mine — 선생님 검수함 목록. */
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.svc.listMine(user);
  }

  /** GET /media/reports/student — 학생: 발송된 내 리포트 목록. */
  @Get('student')
  student(@CurrentUser() user: AuthUser) {
    return this.svc.listStudent(user);
  }

  /** GET /media/reports/:bookingId — 상세(선생님=전사문 포함 / 학생=sent 만·첫 열람 스탬프). */
  @Get(':bookingId')
  detail(@Param('bookingId', ParseUUIDPipe) bookingId: string, @CurrentUser() user: AuthUser) {
    return this.svc.detail(user, bookingId);
  }

  /** PATCH /media/reports/:bookingId — 검수 편집(발송 전). */
  @Patch(':bookingId')
  update(@Param('bookingId', ParseUUIDPipe) bookingId: string, @Body() dto: ReportUpdateDto, @CurrentUser() user: AuthUser) {
    return this.svc.update(user, bookingId, dto);
  }

  /** POST /media/reports/:bookingId/approve — 승인(전건 검수). */
  @Post(':bookingId/approve')
  approve(@Param('bookingId', ParseUUIDPipe) bookingId: string, @CurrentUser() user: AuthUser) {
    return this.svc.approve(user, bookingId);
  }

  /** POST /media/reports/:bookingId/send — 발송(학생 알림·계정 내 열람). */
  @Post(':bookingId/send')
  send(@Param('bookingId', ParseUUIDPipe) bookingId: string, @CurrentUser() user: AuthUser) {
    return this.svc.send(user, bookingId);
  }

  /** POST /media/reports/:bookingId/rebuild — 초안 재생성(파이프라인 재실행). */
  @Post(':bookingId/rebuild')
  rebuild(@Param('bookingId', ParseUUIDPipe) bookingId: string, @CurrentUser() user: AuthUser) {
    return this.svc.rebuild(user, bookingId);
  }
}
