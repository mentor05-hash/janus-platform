import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OpsService } from './ops.service';

/**
 * 클래스 기본은 **관리자 전용**이다(N37). 이전 기본값은 `admin,hr` 이었고, 그 한 줄이
 * 화면 `ops`(관리자 전용)에 대응하는 `admin/ops-settings` 를 HR 에게 열고 있었다 —
 * O181 이 `admin/scores` 에서 잡은 것과 같은 형태다. HR 이 필요한 곳만 메서드에서 넓힌다.
 */
@Controller('admin')
@Roles('admin')
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  /** GET /admin/ops-settings — 운영 정책값 조회(관리자 — 화면 `ops`). */
  @Get('ops-settings')
  opsSettings() {
    return this.ops.getOpsSettings();
  }

  /** PUT /admin/ops-settings — 운영 정책 저장(본사 마스터, 서비스 가드). */
  @Put('ops-settings')
  putOpsSetting(
    @CurrentUser() user: AuthUser,
    @Body() dto: { key: string; value: unknown },
  ) {
    return this.ops.putOpsSetting(user, String(dto?.key ?? ''), dto?.value);
  }

  /** GET /admin/dashboard — 운영 통계. 화면 `dashboard` 는 HR 의 착지 화면이다(O128). */
  @Get('dashboard')
  @Roles('admin', 'hr')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.ops.dashboard(user);
  }
}
