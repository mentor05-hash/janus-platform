import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import { CreditService } from './credit.service';
import { canPayRequest, resolveCreatePath } from './domain/payment-request';
import { CreatePaymentRequestDto, RespondPaymentRequestDto } from './dto/payment-request.dto';

/**
 * 결제요청 3경로 (CLAUDE.md §billing, 통합스펙 §학부모).
 * 학생 직접 / 보호자 대납 / 관리자 발행. 결제 응답 시 크레딧 충전(모의 PG).
 */
@Injectable()
export class PaymentRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credit: CreditService,
  ) {}

  /** 결제요청 생성. 경로는 호출자 역할로 결정. */
  async create(actor: AuthUser, dto: CreatePaymentRequestDto) {
    const path = resolveCreatePath(actor.role); // student_self | guardian_proxy | admin_issued

    let studentId: string;
    let guardianId: string | null = null;
    if (path === 'student_self') {
      studentId = actor.id;
    } else {
      if (!dto.studentId) throw new BadRequestException('대상 학생(studentId)이 필요합니다.');
      studentId = dto.studentId;
      if (path === 'guardian_proxy') {
        await this.assertApprovedLink(actor.id, studentId);
        guardianId = actor.id;
      }
    }
    await this.requireStudent(studentId);

    const req = await this.prisma.payment_request.create({
      data: {
        student_id: studentId,
        guardian_id: guardianId,
        needed_credits: dto.neededCredits,
        status: 'open',
        origin: 'manual',
        ref_type: path,
      },
      select: { id: true, student_id: true, needed_credits: true, status: true, origin: true },
    });
    return { ...req, path };
  }

  /** 역할별 결제요청 목록. */
  async list(actor: AuthUser) {
    if (actor.role === AccountRole.STUDENT) {
      return this.prisma.payment_request.findMany({
        where: { student_id: actor.id },
        orderBy: { created_at: 'desc' },
      });
    }
    if (actor.role === AccountRole.GUARDIAN) {
      const links = await this.prisma.guardian_student_link.findMany({
        where: { guardian_id: actor.id, status: 'approved' },
        select: { student_id: true },
      });
      const studentIds = links.map((l) => l.student_id);
      return this.prisma.payment_request.findMany({
        where: { student_id: { in: studentIds } },
        orderBy: { created_at: 'desc' },
      });
    }
    // admin/hr: 자기 센터 학생의 결제요청만(S4). centerId 없으면(HQ) 전체.
    if (actor.centerId) {
      const centerStudents = await this.prisma.student_profile.findMany({
        where: { center_id: actor.centerId },
        select: { account_id: true },
      });
      const ids = centerStudents.map((s) => s.account_id);
      return this.prisma.payment_request.findMany({
        where: { student_id: { in: ids } },
        orderBy: { created_at: 'desc' },
        take: 200,
      });
    }
    return this.prisma.payment_request.findMany({ orderBy: { created_at: 'desc' }, take: 200 });
  }

  /** 결제요청 응답: pay(대납/결제 → 크레딧 충전) 또는 reject. */
  async respond(id: string, dto: RespondPaymentRequestDto, actor: AuthUser) {
    const req = await this.prisma.payment_request.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('결제요청을 찾을 수 없습니다.');
    if (req.status !== 'open') throw new BadRequestException('이미 처리된 결제요청입니다.');

    // 권한: 본인(학생) 또는 연결된 보호자
    const isStudentOwner = actor.role === AccountRole.STUDENT && actor.id === req.student_id;
    const isLinkedGuardian = actor.role === AccountRole.GUARDIAN;
    if (isLinkedGuardian) await this.assertApprovedLink(actor.id, req.student_id);
    if (!isStudentOwner && !isLinkedGuardian) {
      throw new ForbiddenException('이 결제요청에 응답할 권한이 없습니다.');
    }

    if (dto.action === 'reject') {
      const upd = await this.prisma.payment_request.updateMany({
        where: { id, status: 'open' },
        data: { status: 'rejected' },
      });
      if (upd.count !== 1) throw new ConflictException('이미 처리된 결제요청입니다.');
      return { id, status: 'rejected' };
    }

    if (!canPayRequest(actor.role)) throw new ForbiddenException('결제할 수 없는 역할입니다.');
    // 원자적 처리(§7): 상태 open→done 가드 후 같은 트랜잭션에서 충전(이중 결제 방지).
    await this.prisma.$transaction(async (tx) => {
      const upd = await tx.payment_request.updateMany({
        where: { id, status: 'open' },
        data: { status: 'done' },
      });
      if (upd.count !== 1) throw new ConflictException('이미 처리된 결제요청입니다.');
      await this.credit.chargeWithin(tx, req.student_id, req.needed_credits);
    });
    return { id, status: 'done', chargedCredits: req.needed_credits };
  }

  private async assertApprovedLink(guardianId: string, studentId: string) {
    const link = await this.prisma.guardian_student_link.findFirst({
      where: { guardian_id: guardianId, student_id: studentId, status: 'approved' },
    });
    if (!link) throw new ForbiddenException('연결 승인된 자녀가 아닙니다.');
  }

  private async requireStudent(studentId: string) {
    const s = await this.prisma.student_profile.findUnique({ where: { account_id: studentId } });
    if (!s) throw new NotFoundException('학생을 찾을 수 없습니다.');
  }
}
