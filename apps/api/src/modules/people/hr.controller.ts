import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { $Enums } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole, AccountStatus } from '../../config/enums';
import { NotifyService } from '../notification/notify.service';
import {
  BulkStudentsDto,
  CreateTeacherDto,
  HrLimitsDto,
  StaffPermDto,
} from './dto/hr.dto';

/**
 * HR 등록/승인 (CLAUDE.md §3 people). L2/L3 권한.
 * 자기 센터 학생·선생님·직원 관리(타 센터 열람/활성화 방지, S4).
 */
@Controller('hr')
@Roles('hr', 'admin')
export class HrController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
  ) {}

  /** GET /hr/students — 자기 센터 학생(센터·회원등급 포함). */
  @Get('students')
  async listPendingStudents(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.account.findMany({
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
        center: { select: { name: true } },
        student_profile: {
          select: { membership_grade: { select: { name: true } } },
        },
      },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((s) => ({
      id: s.id,
      login_id: s.login_id,
      name: s.name,
      status: s.status,
      created_at: s.created_at,
      centerName: s.center?.name ?? null,
      membershipGrade: s.student_profile?.membership_grade?.name ?? null,
    }));
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
    await this.notify.notify(id, 'account_approved', {});
    return updated;
  }

  /** POST /hr/students/bulk — DB 일괄 등록(CSV 파싱 결과). 자기 센터·승인 상태로 생성. */
  @Post('students/bulk')
  async bulkStudents(
    @Body() dto: BulkStudentsDto,
    @CurrentUser() user: AuthUser,
  ) {
    let created = 0;
    const errors: { loginId: string; reason: string }[] = [];
    for (const row of dto.students) {
      const loginId = row.loginId.trim();
      if (!loginId || !row.name.trim()) {
        errors.push({ loginId, reason: '아이디·이름 필수' });
        continue;
      }
      try {
        const pw = row.password?.trim() || `itall-${loginId}`;
        const acc = await this.prisma.account.create({
          data: {
            role: AccountRole.STUDENT,
            login_id: loginId,
            pw_hash: await bcrypt.hash(pw, 10),
            name: row.name.trim(),
            center_id: user.centerId ?? null,
            status: AccountStatus.APPROVED,
          },
        });
        await this.prisma.student_profile.create({
          data: { account_id: acc.id, center_id: user.centerId ?? null },
        });
        created += 1;
      } catch {
        errors.push({ loginId, reason: '이미 존재하는 아이디' });
      }
    }
    return { created, failed: errors.length, errors };
  }

  /** POST /hr/teachers — 선생님 등록(계정+프로필). 급여(T5) 연동 필드 포함. */
  @Post('teachers')
  async createTeacher(
    @Body() dto: CreateTeacherDto,
    @CurrentUser() user: AuthUser,
  ) {
    const loginId = dto.loginId.trim();
    if (!loginId || !dto.name.trim())
      throw new BadRequestException('아이디·이름은 필수입니다.');
    try {
      const pw = dto.password?.trim() || `itall-${loginId}`;
      const acc = await this.prisma.account.create({
        data: {
          role: AccountRole.TEACHER,
          login_id: loginId,
          pw_hash: await bcrypt.hash(pw, 10),
          name: dto.name.trim(),
          center_id: user.centerId ?? null,
          status: AccountStatus.APPROVED,
        },
      });
      await this.prisma.teacher_profile.create({
        data: {
          account_id: acc.id,
          center_id: user.centerId ?? null,
          subjects: dto.subjects,
          sub_subjects: [],
          grade: dto.grade as $Enums.teacher_grade_t,
          career: dto.career ?? null,
          teacher_category: dto.category ?? null,
        },
      });
      return { id: acc.id, loginId, status: acc.status };
    } catch {
      throw new BadRequestException('이미 존재하는 아이디입니다.');
    }
  }

  /** GET /hr/teachers — 자기 센터 선생님 목록. */
  @Get('teachers')
  async listTeachers(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.teacher_profile.findMany({
      where: user.centerId ? { center_id: user.centerId } : {},
      select: {
        account_id: true,
        subjects: true,
        grade: true,
        teacher_category: true,
        account: { select: { name: true, status: true } },
        center: { select: { name: true } },
      },
      orderBy: { account: { name: 'asc' } },
      take: 300,
    });
    return rows.map((t) => ({
      id: t.account_id,
      name: t.account?.name ?? '선생님',
      status: t.account?.status ?? null,
      subjects: t.subjects,
      grade: t.grade,
      category: t.teacher_category,
      centerName: t.center?.name ?? null,
    }));
  }

  /** GET /hr/staff — 직원·권한 목록. */
  @Get('staff')
  async listStaff(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.staff_profile.findMany({
      where: user.centerId ? { center_id: user.centerId } : {},
      select: {
        account_id: true,
        staff_role: true,
        perm_level: true,
        account: { select: { name: true, login_id: true } },
        center: { select: { name: true } },
      },
      orderBy: { perm_level: 'asc' },
      take: 300,
    });
    return rows.map((s) => ({
      id: s.account_id,
      name: s.account?.name ?? '직원',
      loginId: s.account?.login_id ?? null,
      staffRole: s.staff_role,
      permLevel: s.perm_level,
      centerName: s.center?.name ?? null,
    }));
  }

  /** PATCH /hr/staff/{id}/perm — 직원 권한 변경. L1 배정/수정은 관리자 전용. */
  @Patch('staff/:id/perm')
  async changePerm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StaffPermDto,
    @CurrentUser() user: AuthUser,
  ) {
    const staff = await this.prisma.staff_profile.findUnique({
      where: { account_id: id },
    });
    if (!staff) throw new NotFoundException('직원을 찾을 수 없습니다.');
    if (user.centerId && staff.center_id !== user.centerId) {
      throw new ForbiddenException('다른 센터 직원은 변경할 수 없습니다.');
    }
    // L1(본사) 권한의 부여·회수는 관리자만(HR 권한 상승 방지, S4).
    if (
      (dto.permLevel === 'L1' || staff.perm_level === 'L1') &&
      user.role !== AccountRole.ADMIN
    ) {
      throw new ForbiddenException('L1(본사) 권한 변경은 관리자만 가능합니다.');
    }
    const updated = await this.prisma.staff_profile.update({
      where: { account_id: id },
      data: { perm_level: dto.permLevel },
      select: { account_id: true, perm_level: true },
    });
    return { id: updated.account_id, permLevel: updated.perm_level };
  }

  /** GET /hr/limits — 분류 한도(센터). */
  @Get('limits')
  async getLimits(@CurrentUser() user: AuthUser) {
    if (!user.centerId)
      return {
        classifyFitLimit: 10,
        classifyUnfitLimit: 30,
        centerScoped: false,
      };
    const lp = await this.prisma.limit_policy.findUnique({
      where: { center_id: user.centerId },
    });
    return {
      classifyFitLimit: lp?.classify_fit_limit ?? 10,
      classifyUnfitLimit: lp?.classify_unfit_limit ?? 30,
      centerScoped: true,
    };
  }

  /** POST /hr/limits — 분류 한도 저장(센터). */
  @Post('limits')
  async putLimits(@Body() dto: HrLimitsDto, @CurrentUser() user: AuthUser) {
    if (!user.centerId)
      throw new BadRequestException(
        '센터 소속 HR만 분류 한도를 저장할 수 있습니다.',
      );
    const data = {
      classify_fit_limit: dto.classifyFitLimit ?? 10,
      classify_unfit_limit: dto.classifyUnfitLimit ?? 30,
    };
    const lp = await this.prisma.limit_policy.upsert({
      where: { center_id: user.centerId },
      update: data,
      create: { center_id: user.centerId, ...data },
    });
    return {
      classifyFitLimit: lp.classify_fit_limit,
      classifyUnfitLimit: lp.classify_unfit_limit,
    };
  }
}
