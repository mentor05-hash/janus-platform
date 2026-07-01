import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AccountRole } from '../../config/enums';
import { AuditService } from './audit.service';

@Controller('admin')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** GET /admin/audit-log — 감사 로그 열람(관리자/HR, 센터 스코프). */
  @Get('audit-log')
  @Roles('admin', 'hr')
  list(@CurrentUser() user: AuthUser, @Query('prefix') prefix?: string) {
    if (user.role !== AccountRole.ADMIN && user.role !== AccountRole.HR) {
      throw new ForbiddenException('관리자만 열람할 수 있습니다.');
    }
    return this.audit.list(user, prefix);
  }
}
