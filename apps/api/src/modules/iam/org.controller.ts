import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { MinPerm } from '../../common/decorators/min-perm.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrgService } from './org.service';
import { CreateCenterDto, CreateStaffDto } from './dto/org.dto';

/**
 * 조직·관리자 계정 관리 (§iam). 본사 이상(@MinPerm L2). L2 생성은 서비스에서 L1 제한.
 */
@Controller()
@Roles('admin')
export class OrgController {
  constructor(private readonly org: OrgService) {}

  /** GET /centers — 센터 목록(관리자). */
  @Get('centers')
  listCenters() {
    return this.org.listCenters();
  }

  /** POST /centers — 센터 생성(본사 이상). */
  @Post('centers')
  @MinPerm('L2')
  createCenter(@Body() dto: CreateCenterDto, @CurrentUser() user: AuthUser) {
    return this.org.createCenter(dto, user);
  }

  /** POST /admin/staff — 관리자 계정 생성(본사 이상; L2 생성은 마스터만). */
  @Post('admin/staff')
  @MinPerm('L2')
  createStaff(@Body() dto: CreateStaffDto, @CurrentUser() user: AuthUser) {
    return this.org.createStaff(user, dto);
  }
}
