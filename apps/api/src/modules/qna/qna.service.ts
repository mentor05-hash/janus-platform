import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { ShortfallError } from '../../common/errors/shortfall.error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import { CreditService } from '../billing/credit.service';
import { PricingService } from '../pricing-policy/pricing.service';
import { AdminPolicyService } from '../pricing-policy/admin-policy.service';
import {
  benefitOf,
  compareQnaQueue,
} from '../pricing-policy/domain/grade-benefits';
import { canAnswerQuestion, QnaScope } from './domain/qna';
import { CreateAnswerDto, CreateQuestionDto } from './dto/qna.dto';
import { Inject } from '@nestjs/common';
import { LLM_PROVIDER } from '../llm/llm.types';
import type { LlmProvider } from '../llm/llm.types';

interface QnaRow {
  id: string;
  subject: string | null;
  difficulty: string | null;
  scope: string | null;
  body: string | null;
  status: string | null;
  created_at: Date;
  assigned_teacher_id?: string | null;
  attachments?: unknown;
  qna_answer?: {
    id: string;
    body: string | null;
    accepted: boolean | null;
    created_at: Date;
    teacher_profile?: { account?: { name?: string } };
  }[];
}

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
    private readonly policy: AdminPolicyService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  /** 질문 요금 안내(학생) — 문항형/일반형 건당 크레딧. 센터별 정책 반영. */
  async pricingInfo(centerId: string | null) {
    const [item, general] = await Promise.all([
      this.pricing.quoteBoard('item', centerId),
      this.pricing.quoteBoard('general', centerId),
    ]);
    return { itemFee: item.credits, generalFee: general.credits };
  }

  /** 질문 등록(학생) — 게시판 건당 과금. 부족 시 결제요청+402. */
  async createQuestion(student: AuthUser, dto: CreateQuestionDto) {
    if (student.role !== AccountRole.STUDENT) {
      throw new ForbiddenException('학생만 질문을 등록할 수 있습니다.');
    }
    if (dto.scope === 'assigned') {
      if (!dto.assignedTeacherId)
        throw new BadRequestException(
          '지정 질문은 assignedTeacherId 가 필요합니다.',
        );
      const t = await this.prisma.teacher_profile.findUnique({
        where: { account_id: dto.assignedTeacherId },
      });
      if (!t) throw new NotFoundException('지정한 선생님을 찾을 수 없습니다.'); // 과금 전 검증
    }
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: student.id },
    });
    if (!sp) throw new NotFoundException('학생 프로필이 없습니다.');

    const quote = await this.pricing.quoteBoard(
      dto.qType ?? 'general',
      sp.center_id,
    );
    const credits = quote.credits;

    try {
      const post = await this.prisma.$transaction(async (tx) => {
        const p = await tx.qna_post.create({
          data: {
            student_id: student.id,
            subject: dto.subject ?? null,
            difficulty: dto.difficulty ?? null,
            scope: dto.scope,
            assigned_teacher_id:
              dto.scope === 'assigned' ? dto.assignedTeacherId! : null,
            body: dto.body,
            status: 'open',
            attachments: (dto.attachments ??
              []) as unknown as Prisma.InputJsonValue,
          },
        });
        if (credits > 0) {
          const outcome = await this.credit.consumeWithin(
            tx,
            student.id,
            credits,
            {
              refType: 'qna',
              refId: p.id,
              description: 'Q&A 질문 등록',
            },
          );
          if (!outcome.ok) throw new ShortfallError(outcome.shortfall);
        }
        return p;
      });
      return {
        id: post.id,
        scope: post.scope,
        status: post.status,
        chargedCredits: credits,
      };
    } catch (e) {
      if (e instanceof ShortfallError) {
        await this.credit.createPaymentRequest(student.id, e.shortfall, {
          refType: 'qna',
        });
        throw new HttpException(
          `크레딧이 ${e.shortfall} 부족합니다. 결제요청이 생성되었습니다.`,
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      throw e;
    }
  }

  /** 목록: 학생=본인 질문, 교사=공개(open)+나에게 지정된 것, 관리자=전체. 답변 포함. */
  async listPosts(user: AuthUser) {
    const answersInclude = {
      qna_answer: {
        orderBy: { created_at: 'asc' as const },
        include: {
          teacher_profile: { include: { account: { select: { name: true } } } },
        },
      },
    };
    const shape = (
      rows: Awaited<ReturnType<typeof this.prisma.qna_post.findMany>>,
    ) =>
      (rows as unknown as QnaRow[]).map((p) => ({
        id: p.id,
        subject: p.subject ?? null,
        difficulty: p.difficulty ?? null,
        scope: p.scope ?? 'open',
        assignedTeacherId: p.assigned_teacher_id ?? null,
        body: p.body ?? '',
        status: p.status ?? 'open',
        created_at: p.created_at,
        attachments: Array.isArray(p.attachments)
          ? (p.attachments as { id: string; name: string; type?: string }[])
          : [],
        answers: (p.qna_answer ?? []).map((a) => ({
          id: a.id,
          body: a.body ?? '',
          accepted: !!a.accepted,
          teacherName: a.teacher_profile?.account?.name ?? '선생님',
          createdAt: a.created_at,
        })),
      }));

    if (user.role === AccountRole.STUDENT) {
      return shape(
        await this.prisma.qna_post.findMany({
          where: { student_id: user.id },
          orderBy: { created_at: 'desc' },
          include: answersInclude,
        }),
      );
    }
    if (user.role === AccountRole.TEACHER) {
      // 답변 큐는 **경합 지점**이다 — 선생님이 목록 위에서부터 claim 하므로 순서가 곧 응답 속도다.
      // 상위 등급 질문에 가중치를 주되(B218), 48h 초과 미답은 등급을 무시하고 앞으로 끌어올린다
      // (기아 방지 + 급여 T5c 48h 보상과 정합). 총 답변량을 늘리지 않으므로 원가는 0.
      const benefits = await this.policy.getGradeBenefits();
      const rows = await this.prisma.qna_post.findMany({
        where: {
          OR: [
            { scope: 'open', status: 'open' },
            { assigned_teacher_id: user.id },
          ],
        },
        orderBy: { created_at: 'desc' },
        include: {
          ...answersInclude,
          student_profile: {
            select: { membership_grade: { select: { tier: true } } },
          },
        },
      });
      const now = new Date();
      const key = (r: (typeof rows)[number]) => ({
        createdAt: r.created_at,
        weight: benefitOf(
          benefits,
          r.student_profile?.membership_grade?.tier ?? null,
        ).qnaQueueWeight,
      });
      return shape(
        [...rows].sort((a, b) => compareQnaQueue(key(a), key(b), now)),
      );
    }
    if (user.role === AccountRole.ADMIN || user.role === AccountRole.HR) {
      return shape(
        await this.prisma.qna_post.findMany({
          orderBy: { created_at: 'desc' },
          take: 200,
          include: answersInclude,
        }),
      );
    }
    throw new ForbiddenException('Q&A 목록 조회 권한이 없습니다.');
  }

  /** 공개질문 가져오기(교사, 선착순 배정) — open→assigned 원자적 전환. unfit 교사 차단(§5-9). */
  async claim(postId: string, teacher: AuthUser) {
    if (teacher.role !== AccountRole.TEACHER) {
      throw new ForbiddenException('선생님만 질문을 가져올 수 있습니다.');
    }
    const post = await this.prisma.qna_post.findUnique({
      where: { id: postId },
    });
    if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');
    if (post.scope !== 'open' || post.status !== 'open') {
      throw new BadRequestException('이미 배정되었거나 마감된 질문입니다.');
    }
    const unfit = await this.prisma.teacher_list_entry.findFirst({
      where: {
        student_id: post.student_id,
        teacher_id: teacher.id,
        list_kind: 'unfit',
      },
    });
    if (unfit) {
      throw new ForbiddenException(
        '학생이 맞지 않는 선생님으로 분류하여 가져올 수 없습니다(§5-9).',
      );
    }
    // 선착순: scope=open·미배정일 때만 1건 전환. 경쟁 시 count!==1 → 409.
    const upd = await this.prisma.qna_post.updateMany({
      where: {
        id: postId,
        scope: 'open',
        status: 'open',
        assigned_teacher_id: null,
      },
      data: { scope: 'assigned', assigned_teacher_id: teacher.id },
    });
    if (upd.count !== 1) {
      throw new ConflictException('다른 선생님이 먼저 가져갔습니다.');
    }
    return { id: postId, assignedTeacherId: teacher.id };
  }

  /** 답변(교사) — 지정/공개 권한 게이트(§5-9). */
  async answer(postId: string, dto: CreateAnswerDto, teacher: AuthUser) {
    if (teacher.role !== AccountRole.TEACHER) {
      throw new ForbiddenException('선생님만 답변할 수 있습니다.');
    }
    const post = await this.prisma.qna_post.findUnique({
      where: { id: postId },
    });
    if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');
    if (post.status !== 'open')
      throw new BadRequestException('마감된 질문입니다.');

    const unfit = await this.prisma.teacher_list_entry.findFirst({
      where: {
        student_id: post.student_id,
        teacher_id: teacher.id,
        list_kind: 'unfit',
      },
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
    // AI 1차 답변 유사도(표절·중복) — 같은 질문의 다른 답변 + 이 선생님의 최근 답변과 비교
    const priorRows = await this.prisma.qna_answer.findMany({
      where: { OR: [{ post_id: postId }, { teacher_id: teacher.id }] },
      select: { id: true, body: true },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    const sim = await this.llm.checkAnswerSimilarity({
      body: dto.body ?? '',
      priors: priorRows
        .filter((r) => r.body)
        .map((r) => ({ id: r.id, body: r.body! })),
    });
    const ans = await this.prisma.qna_answer.create({
      data: {
        post_id: postId,
        teacher_id: teacher.id,
        body: dto.body,
        accepted: false,
        pay_eligible: false,
        similarity: sim.maxSimilarity,
        similar_to_id: sim.similarToId ?? null,
        sim_flagged: sim.flagged,
      },
    });
    return {
      id: ans.id,
      postId,
      accepted: false,
      simFlagged: sim.flagged,
      similarity: sim.maxSimilarity,
      simSummary: sim.summary,
    };
  }

  /** 답변 채택(질문 학생) — 채택 답변 급여 적격(pay_eligible), 질문 마감. */
  async acceptAnswer(answerId: string, student: AuthUser) {
    const ans = await this.prisma.qna_answer.findUnique({
      where: { id: answerId },
      include: { qna_post: true },
    });
    if (!ans) throw new NotFoundException('답변을 찾을 수 없습니다.');
    if (ans.qna_post.student_id !== student.id) {
      throw new ForbiddenException('본인 질문의 답변만 채택할 수 있습니다.');
    }
    await this.prisma.$transaction(async (tx) => {
      const upd = await tx.qna_post.updateMany({
        where: { id: ans.post_id, status: 'open' },
        data: { status: 'resolved' },
      });
      if (upd.count !== 1)
        throw new ConflictException('이미 채택/마감된 질문입니다.');
      await tx.qna_answer.update({
        where: { id: answerId },
        data: { accepted: true, pay_eligible: true },
      });
    });
    return { id: answerId, accepted: true, payEligible: true };
  }
}
