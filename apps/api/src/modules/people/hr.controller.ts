import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountStatus } from '../../config/enums';

/**
 * HR 등록/승인 (CLAUDE.md §3 people). L2/L3 권한.
 * MVP: 가입 대기(pending) 계정 조회 + 승인(approved).
 */
@Controller('hr')
@Roles('hr', 'admin')
export class HrController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /hr/students — 승인 대기/전체 학생 계정. */
  @Get('students')
  async listPendingStudents() {
    const rows = await this.prisma.account.findMany({
      where: { role: 'student' },
      select: { id: true, login_id: true, name: true, status: true, created_at: true },
      orderBy: { created_at: 'desc' },
    });
    return rows;
  }

  /** POST /hr/students/{id}/approve — 계정 활성화. */
  @Post('students/:id/approve')
  async approve(@Param('id', ParseUUIDPipe) id: string) {
    const updated = await this.prisma.account.update({
      where: { id },
      data: { status: AccountStatus.APPROVED },
      select: { id: true, status: true },
    });
    return updated;
  }
}
