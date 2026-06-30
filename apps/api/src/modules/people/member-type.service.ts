import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateMemberTypeDto, SetMemberTypeDto } from './dto/member-type.dto';

/**
 * 회원 분류(선생님·학생 유형) — 확장 가능(§people).
 * 분류 체계 관리(생성/비활성)는 본사 이상(컨트롤러 @MinPerm), 배정은 센터관리자·HR.
 */
@Injectable()
export class MemberTypeService {
  constructor(private readonly prisma: PrismaService) {}

  /** 활성 분류 목록(kind=teacher|student). */
  list(kind?: 'teacher' | 'student') {
    return this.prisma.member_type.findMany({
      where: { active: true, ...(kind ? { kind } : {}) },
      orderBy: [{ kind: 'asc' }, { sort_order: 'asc' }],
    });
  }

  /** 분류 추가(본사 이상). */
  async create(dto: CreateMemberTypeDto) {
    const exists = await this.prisma.member_type.findUnique({ where: { kind_code: { kind: dto.kind, code: dto.code } } });
    if (exists) throw new BadRequestException(`이미 존재하는 분류입니다(${dto.kind}/${dto.code}).`);
    return this.prisma.member_type.create({
      data: { kind: dto.kind, code: dto.code, label: dto.label, sort_order: dto.sortOrder ?? 0 },
    });
  }

  /** 분류 비활성(본사 이상) — 기존 배정은 유지, 신규 선택에서 제외. */
  async deactivate(id: string) {
    const t = await this.prisma.member_type.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('분류를 찾을 수 없습니다.');
    return this.prisma.member_type.update({ where: { id }, data: { active: false }, select: { id: true, active: true } });
  }

  /** 선생님/학생 분류 배정(센터관리자·HR). 유효한 활성 분류여야 함. */
  async assign(kind: 'teacher' | 'student', accountId: string, dto: SetMemberTypeDto, actor: AuthUser) {
    const mt = await this.prisma.member_type.findUnique({ where: { kind_code: { kind, code: dto.typeCode } } });
    if (!mt || !mt.active) throw new BadRequestException('유효하지 않은 분류 코드입니다.');

    if (kind === 'teacher') {
      const prof = await this.prisma.teacher_profile.findUnique({ where: { account_id: accountId } });
      if (!prof) throw new NotFoundException('선생님을 찾을 수 없습니다.');
      this.assertCenter(prof.center_id, actor);
      await this.prisma.teacher_profile.update({ where: { account_id: accountId }, data: { type_code: dto.typeCode } });
    } else {
      const prof = await this.prisma.student_profile.findUnique({ where: { account_id: accountId } });
      if (!prof) throw new NotFoundException('학생을 찾을 수 없습니다.');
      this.assertCenter(prof.center_id, actor);
      await this.prisma.student_profile.update({ where: { account_id: accountId }, data: { type_code: dto.typeCode } });
    }
    return { accountId, kind, typeCode: dto.typeCode, label: mt.label };
  }

  private assertCenter(targetCenter: string | null, actor: AuthUser) {
    // 센터관리자/HR 은 자기 센터만. 본사/마스터(center 미소속)는 전체.
    if (actor.centerId && targetCenter !== actor.centerId) {
      throw new ForbiddenException('다른 센터 회원의 분류는 변경할 수 없습니다.');
    }
  }
}
