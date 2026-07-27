import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OpsService } from './ops.service';

@Controller('admin')
@Roles('admin', 'hr')
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  /** GET /admin/ops-settings — 운영 정책값 조회(관리자/HR — 표시용). */
  @Get('ops-settings')
  opsSettings() {
    return this.ops.getOpsSettings();
  }

  /** PUT /admin/ops-settings — 운영 정책 저장(본사 마스터, 서비스 가드). */
  @Put('ops-settings')
  putOpsSetting(@CurrentUser() user: AuthUser, @Body() dto: { key: string; value: unknown }) {
    return this.ops.putOpsSetting(user, String(dto?.key ?? ''), dto?.value);
  }

  /** GET /admin/dashboard — 운영 통계(관리자/HR). */
  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.ops.dashboard(user);
  }
}
