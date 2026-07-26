import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { ShortfallError } from '../../common/errors/shortfall.error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import { CreditService } from '../billing/credit.service';
import { PricingService } from '../pricing-policy/pricing.service';
import { ConfigService } from '@nestjs/config';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import { envInt } from '../../common/quota/usage-quota';
import {
  SubjectQuota,
  SubjectQuotaExceededError,
} from '../../common/quota/subject-quota';
import { AdminPolicyService } from '../pricing-policy/admin-policy.service';
import {
  benefitOf,
  compareQnaQueue,
} from '../pricing-policy/domain/grade-benefits';
import { canAnswerQuestion, QnaScope } from './domain/qna';
import { CreateAnswerDto, CreateQuestionDto } from './dto/qna.dto';
import { Inject } from '@nestjs/common';
import { LLM_PROVIDER } from '../llm/llm.types';
import type { AnswerSimilarityResult, LlmProvider } from '../llm/llm.types';

/**
 * 유사도 비교에 넣을 이전 답변 수. 프롬프트 길이 = 호출당 단가라 상한이 필요하다.
 * 기존 100건은 답변 본문 100개를 한 프롬프트에 실어 비용 추정을 크게 벗어났다.
 */
const SIMILARITY_PRIOR_LIMIT = 20;

/** 교사 1인 일 유사도 검사 기본 상한. 하루에 이보다 많이 답변하면 검사 없이 등록된다. */
const DEFAULT_SIMILARITY_PER_USER_DAY = 40;

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
  private readonly logger = new Logger(QnaService.name);
  private readonly subject: SubjectQuota;
  /** 교사 1인 일 유사도 검사 횟수. ENV 우선. */
  private readonly simPerUserDay: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly credit: CreditService,
    private readonly policy: AdminPolicyService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Inject(CACHE_PROVIDER) cache: CacheProvider,
    config: ConfigService,
  ) {
    this.subject = new SubjectQuota(cache, 'llm');
    this.simPerUserDay = envInt(
      config.get<string>('LLM_SIMILARITY_PER_USER_DAY'),
      DEFAULT_SIMILARITY_PER_USER_DAY,
    );
  }

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
    // AI 1차 답변 유사도(표절·중복) — best-effort. 실패해도 답변 등록은 막지 않는다(아래 주석).
    const sim = await this.similarityBestEffort(
      postId,
      teacher,
      dto.body ?? '',
    );
    const ans = await this.prisma.qna_answer.create({
      data: {
        post_id: postId,
        teacher_id: teacher.id,
        body: dto.body,
        accepted: false,
        pay_eligible: false,
        // `similarity = NULL` 이 곧 **미검사** 표식이다(검사되면 0 이라도 값이 들어간다).
        // sim_flagged 는 non-null 컬럼이라 미검사 시 false — 단독으로는 구분이 안 되므로
        // 관리자·교사 화면은 similarity 의 null 여부로 "검사됨"을 판단해야 한다.
        similarity: sim?.maxSimilarity ?? null,
        similar_to_id: sim?.similarToId ?? null,
        sim_flagged: sim?.flagged ?? false,
      },
    });
    return {
      id: ans.id,
      postId,
      accepted: false,
      // 검사를 못 붙였으면 미검사 상태로 정직하게 내려보낸다(관리자·교사 화면이 구분해야 한다).
      simChecked: sim !== null,
      simFlagged: sim?.flagged ?? null,
      similarity: sim?.maxSimilarity ?? null,
      simSummary: sim?.summary ?? null,
    };
  }

  /**
   * 답변 유사도 검사 — **검사 실패가 답변 등록을 막지 않는다**.
   *
   * 이전 구현은 `checkAnswerSimilarity()` 를 먼저 호출하고 그 결과로 row 를 만들었다.
   * 그래서 LLM 장애나 비용 상한 도달이 곧 **답변 등록 전면 중단**이었다 —
   * 학생은 답을 못 받고 선생님은 급여 적격 건을 못 만든다. 부수 기능(표절 검사)이
   * 핵심 기능(답변)을 끄는 순서라 뒤집었다(신고 접수와 같은 원칙 — B221).
   *
   * 또 이 호출은 교사 1인이 답변마다 트리거하고 프롬프트에 이전 답변을 최대 20건 싣는다.
   * 사용자별 일 한도를 걸어 한 명이 `similarity` 상한(300/일)을 태우지 못하게 한다.
   */
  private async similarityBestEffort(
    postId: string,
    teacher: AuthUser,
    body: string,
  ): Promise<AnswerSimilarityResult | null> {
    try {
      await this.subject.consume(
        'abuse',
        'answer_similarity',
        teacher.id,
        this.simPerUserDay,
        'day',
      );
    } catch (e) {
      if (e instanceof SubjectQuotaExceededError) {
        this.logger.warn(
          `[qna] 교사 일 유사도 검사 한도 초과 — 검사 없이 등록: teacher=${teacher.id}`,
        );
        return null;
      }
      throw e;
    }
    // 비교 대상이 많을수록 프롬프트가 길어져 호출당 단가가 오른다 — 20건으로 제한한다.
    // (100건이면 답변 본문 100개가 한 프롬프트에 들어가 비용 추정이 크게 어긋난다.)
    const priorRows = await this.prisma.qna_answer.findMany({
      where: { OR: [{ post_id: postId }, { teacher_id: teacher.id }] },
      select: { id: true, body: true },
      orderBy: { created_at: 'desc' },
      take: SIMILARITY_PRIOR_LIMIT,
    });
    try {
      return await this.llm.checkAnswerSimilarity({
        body,
        priors: priorRows
          .filter((r) => r.body)
          .map((r) => ({ id: r.id, body: r.body! })),
      });
    } catch {
      // 전역 상한(503)·모델 오류 모두 여기로 온다 — 등록은 계속한다.
      this.logger.warn('[qna] 답변 유사도 검사 실패 — 검사 없이 등록');
      return null;
    }
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
