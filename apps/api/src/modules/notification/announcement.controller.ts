import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AnnouncementService } from './announcement.service';
import { AnnouncementDto, AnnouncementTemplateDto } from './dto/announcement.dto';

/**
 * 관리자 공지 알림 (§3 notification). 센터관리자·본사관리자 전용.
 * 즉시 발송 + 예약 발송(scheduledAt) + 예약 목록/취소.
 */
@Controller('admin')
@Roles('admin')
export class AnnouncementController {
  constructor(private readonly announcement: AnnouncementService) {}

  /** POST /admin/announcements — 대상 역할별 공지(scheduledAt 지정 시 예약). */
  @Post('announcements')
  send(@Body() dto: AnnouncementDto, @CurrentUser() user: AuthUser) {
    return this.announcement.send(user, dto);
  }

  /** GET /admin/announcements/scheduled — 발송 대기 중 예약 공지. */
  @Get('announcements/scheduled')
  listScheduled(@CurrentUser() user: AuthUser) {
    return this.announcement.listScheduled(user);
  }

  /** POST /admin/announcements/scheduled/{id}/cancel — 예약 공지 취소(발송 전). */
  @Post('announcements/scheduled/:id/cancel')
  cancelScheduled(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.announcement.cancelScheduled(id, user);
  }

  /** POST /admin/announcement-templates — 공지 템플릿 저장. */
  @Post('announcement-templates')
  createTemplate(@Body() dto: AnnouncementTemplateDto, @CurrentUser() user: AuthUser) {
    return this.announcement.createTemplate(user, dto);
  }

  /** GET /admin/announcement-templates — 저장된 템플릿 목록(본사 공용 + 자기 센터). */
  @Get('announcement-templates')
  listTemplates(@CurrentUser() user: AuthUser) {
    return this.announcement.listTemplates(user);
  }

  /** DELETE /admin/announcement-templates/{id} — 템플릿 삭제. */
  @Delete('announcement-templates/:id')
  deleteTemplate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.announcement.deleteTemplate(id, user);
  }
}
