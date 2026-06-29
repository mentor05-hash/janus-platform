import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AnnouncementService } from './announcement.service';
import { AnnouncementDto } from './dto/announcement.dto';

/**
 * 관리자 공지 알림 (§3 notification). 센터관리자·본사관리자 전용.
 */
@Controller('admin')
@Roles('admin')
export class AnnouncementController {
  constructor(private readonly announcement: AnnouncementService) {}

  /** POST /admin/announcements — 대상 역할별 공지 발송. */
  @Post('announcements')
  send(@Body() dto: AnnouncementDto, @CurrentUser() user: AuthUser) {
    return this.announcement.send(user, dto);
  }
}
