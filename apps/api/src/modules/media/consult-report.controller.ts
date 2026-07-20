import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { ConsultReportService } from './consult-report.service';

class ReportUpdateDto {
  @IsOptional() @IsArray() @IsString({ each: true }) covered?: string[];
  @IsOptional() @IsString() diagnosis?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) nextActions?: string[];
}

/** 2뷰 편집 — audience 별 부분 수정(학생: covered/reviewPoints/nextLearning · 학부모: progress/recommendedActions/effort). */
class ViewUpdateDto {
  @IsIn(['student', 'guardian']) audience!: 'student' | 'guardian';
  @IsOptional() @IsArray() @IsString({ each: true }) covered?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) reviewPoints?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) nextLearning?: string[];
  @IsOptional() @IsString() progress?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) recommendedActions?: string[];
  @IsOptional() @IsString() effort?: string;
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

  // ── 학생용/학부모용 2뷰 (발송·수신 레이어) ──

  /** POST /media/reports/:bookingId/views/generate — 원천(오디오 or 메모)에서 2뷰 초안 생성. */
  @Post(':bookingId/views/generate')
  generateViews(@Param('bookingId', ParseUUIDPipe) bookingId: string, @CurrentUser() user: AuthUser) {
    return this.svc.generateViews(user, bookingId);
  }

  /** GET /media/reports/:bookingId/views — 2뷰 상세(선생님=전 상태 / 학생=sent, student 뷰 열람 스탬프). */
  @Get(':bookingId/views')
  views(@Param('bookingId', ParseUUIDPipe) bookingId: string, @CurrentUser() user: AuthUser) {
    return this.svc.viewsDetail(user, bookingId);
  }

  /** PATCH /media/reports/:bookingId/views — audience 뷰 편집(발송 전). */
  @Patch(':bookingId/views')
  updateView(@Param('bookingId', ParseUUIDPipe) bookingId: string, @Body() dto: ViewUpdateDto, @CurrentUser() user: AuthUser) {
    const { audience, ...patch } = dto;
    return this.svc.updateView(user, bookingId, audience, patch);
  }

  /** POST /media/reports/:bookingId/views/approve — 2뷰 승인. */
  @Post(':bookingId/views/approve')
  approveViews(@Param('bookingId', ParseUUIDPipe) bookingId: string, @CurrentUser() user: AuthUser) {
    return this.svc.approveViews(user, bookingId);
  }

  /** POST /media/reports/:bookingId/views/send — 2뷰 발송(학생 계정 노출). */
  @Post(':bookingId/views/send')
  sendViews(@Param('bookingId', ParseUUIDPipe) bookingId: string, @CurrentUser() user: AuthUser) {
    return this.svc.sendViews(user, bookingId);
  }

  /** POST /media/reports/:bookingId/share-guardian — 학부모께 공유(학생 주도). */
  @Post(':bookingId/share-guardian')
  shareGuardian(@Param('bookingId', ParseUUIDPipe) bookingId: string, @CurrentUser() user: AuthUser) {
    return this.svc.shareToGuardian(user, bookingId);
  }

  /** GET /media/reports/guardian/:studentId — 학부모: 연결된 자녀의 공유된 리포트 목록. */
  @Get('guardian/:studentId')
  guardianList(@Param('studentId', ParseUUIDPipe) studentId: string, @CurrentUser() user: AuthUser) {
    return this.svc.listGuardianShared(user, studentId);
  }

  /** GET /media/reports/guardian/:studentId/:bookingId — 학부모: 공유된 guardian 뷰 상세. */
  @Get('guardian/:studentId/:bookingId')
  guardianDetail(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @CurrentUser() user: AuthUser,
  ) {
    if (!studentId || !bookingId) throw new BadRequestException('잘못된 요청입니다.');
    return this.svc.guardianViewDetail(user, studentId, bookingId);
  }
}
