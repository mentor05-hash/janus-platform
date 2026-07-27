import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AccountRole } from '../../config/enums';
import { AuditService } from './audit.service';

@Controller('admin')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /**
   * GET /admin/audit-log — 감사 로그 열람(**관리자 전용**, 센터 스코프).
   * HR 차단(O128): 응답의 payroll.settle·payroll.pay 요약문이 개인별 실지급·공제 금액 원문이라
   * O127 이 급여에서 뗀 정보가 이 경로로 그대로 새고 있었다(실측 48건). 화면에 '급여' 필터 칩까지 있다.
   */
  @Get('audit-log')
  @Roles('admin')
  list(@CurrentUser() user: AuthUser, @Query('prefix') prefix?: string) {
    if (user.role !== AccountRole.ADMIN) {
      throw new ForbiddenException('관리자만 열람할 수 있습니다.');
    }
    return this.audit.list(user, prefix);
  }
}
