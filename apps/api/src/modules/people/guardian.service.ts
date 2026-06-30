import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import { NotifyService } from '../notification/notify.service';
import { canLinkTransition, GuardianLinkStatus } from './domain/guardian-link';
import {
  GuardianLinkRequestDto,
  GuardianLinkRespondDto,
} from './dto/guardian.dto';

/**
 * 보호자-학생 연결 (CLAUDE.md §3 people, 통합스펙 §학부모).
 * 신청(pending) → 학생/관리자 승인(approved)·거절(rejected), 승인 후 해제(revoked).
 */
@Injectable()
export class GuardianService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
  ) {}

  /** 보호자가 자녀 연결 신청(학생 로그인ID 기준). */
  async requestLink(guardian: AuthUser, dto: GuardianLinkRequestDto) {
    const studentAccount = await this.prisma.account.findUnique({
      where: { login_id: dto.studentLoginId },
    });
    if (!studentAccount || studentAccount.role !== AccountRole.STUDENT) {
      throw new NotFoundException('학생을 찾을 수 없습니다.');
    }
    // guardian 행 보장(가입 시 미생성일 수 있음)
    await this.prisma.guardian.upsert({
      where: { account_id: guardian.id },
      update: {},
      create: { account_id: guardian.id },
    });

    const existing = await this.prisma.guardian_student_link.findFirst({
      where: { guardian_id: guardian.id, student_id: studentAccount.id },
    });
    if (existing) {
      throw new BadRequestException(
        `이미 연결 신청이 존재합니다(status=${existing.status}).`,
      );
    }
    const link = await this.prisma.guardian_student_link.create({
      data: {
        guardian_id: guardian.id,
        student_id: studentAccount.id,
        relation: dto.relation ?? null,
        status: 'pending',
        link_method: '신청',
      },
      select: { id: true, student_id: true, status: true },
    });
    // 보호자 연결 신청 → 학생에게 승인 요청 알림
    await this.notify.notify(studentAccount.id, 'guardian_link_requested', {
      linkId: link.id,
      guardianId: guardian.id,
    });
    return link;
  }

  /** 보호자의 승인된 자녀 목록(대시보드). */
  async listChildren(guardian: AuthUser) {
    const links = await this.prisma.guardian_student_link.findMany({
      where: { guardian_id: guardian.id, status: 'approved' },
      select: { id: true, student_id: true, relation: true },
    });
    const children = await Promise.all(
      links.map(async (l) => {
        const acc = await this.prisma.account.findUnique({
          where: { id: l.student_id },
          select: { name: true },
        });
        return {
          linkId: l.id,
          studentId: l.student_id,
          name: acc?.name ?? null,
          relation: l.relation,
        };
      }),
    );
    return children;
  }

  /** 학생 본인 또는 관리자/HR 이 연결 신청에 승인·거절·해제. */
  async respondLink(
    linkId: string,
    dto: GuardianLinkRespondDto,
    actor: AuthUser,
  ) {
    const link = await this.prisma.guardian_student_link.findUnique({
      where: { id: linkId },
    });
    if (!link) throw new NotFoundException('연결 신청을 찾을 수 없습니다.');

    const isStudentOwner =
      actor.role === AccountRole.STUDENT && actor.id === link.student_id;
    const isAdmin =
      actor.role === AccountRole.ADMIN || actor.role === AccountRole.HR;
    if (!isStudentOwner && !isAdmin) {
      throw new ForbiddenException('연결을 승인/거절할 권한이 없습니다.');
    }

    const to: GuardianLinkStatus =
      dto.action === 'approve'
        ? 'approved'
        : dto.action === 'reject'
          ? 'rejected'
          : 'revoked';
    if (!canLinkTransition(link.status as GuardianLinkStatus, to)) {
      throw new BadRequestException(
        `허용되지 않는 연결 상태 전이: ${link.status} → ${to}`,
      );
    }
    const updated = await this.prisma.guardian_student_link.update({
      where: { id: linkId },
      data: { status: to },
      select: { id: true, status: true },
    });
    // 연결 신청 응답 → 신청한 보호자에게 알림(승인/거절/해제)
    await this.notify.notify(link.guardian_id, 'guardian_link_responded', {
      linkId,
      status: to,
      studentId: link.student_id,
    });
    return updated;
  }
}
