import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import { CreditService } from '../billing/credit.service';
import { PricingService } from '../pricing-policy/pricing.service';
import { canAnswerQuestion, QnaScope } from './domain/qna';
import { CreateAnswerDto, CreateQuestionDto } from './dto/qna.dto';

/**
 * 온라인 Q&A (CLAUDE.md §6 Phase 3). 질문 건당 과금(§5-2), 공개질문 수임 게이트(§5-9),
 * 채택 시 답변 급여 적격(pay_eligible) — payroll 정산에서 합산.
 */
@Injectable()
export class QnaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly credit: CreditService,
  ) {}

  /** 질문 등록(학생) — 게시판 건당 과금. 부족 시 결제요청+402. */
  async createQuestion(student: AuthUser, dto: CreateQuestionDto) {
    if (student.role !== AccountRole.STUDENT) {
      throw new ForbiddenException('학생만 질문을 등록할 수 있습니다.');
    }
    if (dto.scope === 'assigned' && !dto.assignedTeacherId) {
      throw new BadRequestException('지정 질문은 assignedTeacherId 가 필요합니다.');
    }
    const sp = await this.prisma.student_profile.findUnique({ where: { account_id: student.id } });
    if (!sp) throw new NotFoundException('학생 프로필이 없습니다.');

    const quote = await this.pricing.quoteBoard(dto.qType ?? 'general', sp.center_id);
    const credits = quote.credits;

    try {
      const post = await this.prisma.$transaction(async (tx) => {
        const p = await tx.qna_post.create({
          data: {
            student_id: student.id,
            subject: dto.subject ?? null,
            difficulty: dto.difficulty ?? null,
            scope: dto.scope as never,
            assigned_teacher_id: dto.scope === 'assigned' ? dto.assignedTeacherId! : null,
            body: dto.body,
            status: 'open',
          },
        });
        if (credits > 0) {
          const outcome = await this.credit.consumeWithin(tx, student.id, credits, {
            refType: 'qna',
            refId: p.id,
            description: 'Q&A 질문 등록',
          });
          if (!outcome.ok) throw new ShortfallError(outcome.shortfall);
        }
        return p;
      });
      return { id: post.id, scope: post.scope, status: post.status, chargedCredits: credits };
    } catch (e) {
      if (e instanceof ShortfallError) {
        await this.credit.createPaymentRequest(student.id, e.shortfall, { refType: 'qna' });
        throw new HttpException(
          `크레딧이 ${e.shortfall} 부족합니다. 결제요청이 생성되었습니다.`,
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      throw e;
    }
  }

  /** 목록: 학생=본인 질문, 교사=공개(open)+나에게 지정된 것, 관리자=전체. */
  async listPosts(user: AuthUser) {
    if (user.role === AccountRole.STUDENT) {
      return this.prisma.qna_post.findMany({ where: { student_id: user.id }, orderBy: { created_at: 'desc' } });
    }
    if (user.role === AccountRole.TEACHER) {
      return this.prisma.qna_post.findMany({
        where: { OR: [{ scope: 'open' as never, status: 'open' }, { assigned_teacher_id: user.id }] },
        orderBy: { created_at: 'desc' },
      });
    }
    // 운영(관리자/HR)만 전체 조회. 그 외(보호자 등)는 차단(§5-10 누출 방지).
    if (user.role === AccountRole.ADMIN || user.role === AccountRole.HR) {
      return this.prisma.qna_post.findMany({ orderBy: { created_at: 'desc' }, take: 200 });
    }
    throw new ForbiddenException('Q&A 목록 조회 권한이 없습니다.');
  }

  /** 답변(교사) — 지정/공개 권한 게이트(§5-9). */
  async answer(postId: string, dto: CreateAnswerDto, teacher: AuthUser) {
    if (teacher.role !== AccountRole.TEACHER) {
      throw new ForbiddenException('선생님만 답변할 수 있습니다.');
    }
    const post = await this.prisma.qna_post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');
    if (post.status !== 'open') throw new BadRequestException('마감된 질문입니다.');

    const unfit = await this.prisma.teacher_list_entry.findFirst({
      where: { student_id: post.student_id, teacher_id: teacher.id, list_kind: 'unfit' as never },
    });
    const verdict = canAnswerQuestion({
      scope: post.scope as QnaScope,
      assignedTeacherId: post.assigned_teacher_id,
      teacherId: teacher.id,
      isUnfitForStudent: !!unfit,
    });
    if (!verdict.allowed) {
      throw new ForbiddenException(
        verdict.reason === 'unfit'
          ? '학생이 맞지 않는 선생님으로 분류하여 답변할 수 없습니다(§5-9).'
          : '지정된 선생님만 답변할 수 있습니다.',
      );
    }
    const ans = await this.prisma.qna_answer.create({
      data: { post_id: postId, teacher_id: teacher.id, body: dto.body, accepted: false, pay_eligible: false },
    });
    return { id: ans.id, postId, accepted: false };
  }

  /** 답변 채택(질문 학생) — 채택 답변 급여 적격(pay_eligible), 질문 마감. */
  async acceptAnswer(answerId: string, student: AuthUser) {
    const ans = await this.prisma.qna_answer.findUnique({ where: { id: answerId }, include: { qna_post: true } });
    if (!ans) throw new NotFoundException('답변을 찾을 수 없습니다.');
    if (ans.qna_post.student_id !== student.id) {
      throw new ForbiddenException('본인 질문의 답변만 채택할 수 있습니다.');
    }
    await this.prisma.$transaction(async (tx) => {
      const upd = await tx.qna_post.updateMany({
        where: { id: ans.post_id, status: 'open' },
        data: { status: 'resolved' },
      });
      if (upd.count !== 1) throw new ConflictException('이미 채택/마감된 질문입니다.');
      await tx.qna_answer.update({ where: { id: answerId }, data: { accepted: true, pay_eligible: true } });
    });
    return { id: answerId, accepted: true, payEligible: true };
  }
}

class ShortfallError extends Error {
  constructor(public readonly shortfall: number) {
    super('INSUFFICIENT_CREDITS');
  }
}
