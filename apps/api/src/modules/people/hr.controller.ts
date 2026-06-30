import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountStatus } from '../../config/enums';
import { NotifyService } from '../notification/notify.service';

/**
 * HR 등록/승인 (CLAUDE.md §3 people). L2/L3 권한.
 * 자기 센터 학생만 조회·승인(타 센터 열람/활성화 방지, S4).
 */
@Controller('hr')
@Roles('hr', 'admin')
export class HrController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
  ) {}

  /** GET /hr/students — 자기 센터 학생 계정. */
  @Get('students')
  async listPendingStudents(@CurrentUser() user: AuthUser) {
    return this.prisma.account.findMany({
      where: {
        role: 'student',
        ...(user.centerId ? { center_id: user.centerId } : {}),
      },
      select: {
        id: true,
        login_id: true,
        name: true,
        status: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /** POST /hr/students/{id}/approve — 자기 센터 학생 활성화. */
  @Post('students/:id/approve')
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const target = await this.prisma.account.findUnique({ where: { id } });
    if (!target || target.role !== 'student')
      throw new NotFoundException('학생을 찾을 수 없습니다.');
    if (user.centerId && target.center_id !== user.centerId) {
      throw new ForbiddenException('다른 센터의 학생은 승인할 수 없습니다.');
    }
    const updated = await this.prisma.account.update({
      where: { id },
      data: { status: AccountStatus.APPROVED },
      select: { id: true, status: true },
    });
    // 계정 승인 → 학생 알림(활성화 안내)
    await this.notify.notify(id, 'account_approved', {});
    return updated;
  }
}
