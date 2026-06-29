import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OpsService } from './ops.service';

@Controller('admin')
@Roles('admin', 'hr')
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  /** GET /admin/dashboard — 운영 통계(관리자/HR). */
  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.ops.dashboard(user);
  }
}
