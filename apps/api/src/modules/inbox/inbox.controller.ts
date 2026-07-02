import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { InboxService } from './inbox.service';

/** 선생님 인박스 — 대기 상담신청·질문·미확인 채팅·알림 집계(모바일). */
@Controller('me')
export class InboxController {
  constructor(private readonly svc: InboxService) {}

  @Get('inbox')
  @Roles('teacher')
  inbox(@CurrentUser() user: AuthUser) {
    return this.svc.teacherInbox(user);
  }
}
