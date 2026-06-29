import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BlockService } from './block.service';
import { ReportService } from './report.service';
import { BlockDto, CreateReportDto, HandleReportDto } from './dto/report.dto';

@Controller()
export class ReportController {
  constructor(
    private readonly reports: ReportService,
    private readonly blocks: BlockService,
  ) {}

  /** POST /reports — 신고 등록(인증 사용자) + AI 1차 검토. */
  @Post('reports')
  createReport(@Body() dto: CreateReportDto, @CurrentUser() user: AuthUser) {
    return this.reports.create(user, dto);
  }

  /** GET /reports — 신고 목록(관리자/HR). */
  @Get('reports')
  @Roles('admin', 'hr')
  listReports(@CurrentUser() user: AuthUser) {
    return this.reports.list(user);
  }

  /** PATCH /reports/{id} — 신고 처리(관리자/HR). */
  @Patch('reports/:id')
  @Roles('admin', 'hr')
  handleReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HandleReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reports.handle(id, dto, user);
  }

  /** GET /teacher-blocks — 내 차단 목록(학생). */
  @Get('teacher-blocks')
  @Roles('student')
  listBlocks(@CurrentUser() user: AuthUser) {
    return this.blocks.list(user);
  }

  /** POST /teacher-blocks — 교사 차단(학생). */
  @Post('teacher-blocks')
  @Roles('student')
  block(@Body() dto: BlockDto, @CurrentUser() user: AuthUser) {
    return this.blocks.block(user, dto.teacherId);
  }

  /** DELETE /teacher-blocks/{teacherId} — 차단 해제(학생). */
  @Delete('teacher-blocks/:teacherId')
  @Roles('student')
  unblock(@Param('teacherId', ParseUUIDPipe) teacherId: string, @CurrentUser() user: AuthUser) {
    return this.blocks.unblock(user, teacherId);
  }
}
