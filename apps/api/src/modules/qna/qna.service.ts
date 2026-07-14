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
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import { withCronLock } from '../../common/cache/cron-lock';
import { ShortfallError } from '../../common/errors/shortfall.error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import { CreditService } from '../billing/credit.service';
import { PricingService } from '../pricing-policy/pricing.service';
import { canAnswerQuestion, QnaScope } from './domain/qna';
import { computeSla } from './domain/qna-sla';
import { pickAssignee } from './domain/qna-assign';
import { CreateAnswerDto, CreateQuestionDto } from './dto/qna.dto';
import { Inject } from '@nestjs/common';
import { LLM_PROVIDER } from '../llm/llm.types';
import type { LlmProvider } from '../llm/llm.types';

// 강제배정 상태기계 임계값(§1-2 배정 루프). 운영 중 필요 시 정책값으로 승격.
const CLAIM_TTL_MIN = 30; // 클레임 후 이 시간까지 첫 응답 없으면 재개방
const OPEN_AGE_MIN = 15; // 공개(미배정) 질문이 이 시간 지나면 강제배정
const SWEEP_LIMIT = 50; // 1회 스윕당 강제배정 상한

interface QnaRow {
  id: string; subject: string | null; difficulty: string | null; scope: string | null;
  body: string | null; status: string | null; created_at: Date; assigned_teacher_id?: string | null;
  attachments?: unknown; rating?: number | null; continue_pref?: boolean | null;
  qna_answer?: { id: string; body: string | null; accepted: boolean | null; created_at: Date; teacher_id?: string | null; teacher_profile?: { account?: { name?: string } } }[];
}

/**
 * 온라인 Q&A (CLAUDE.md §6 Phase 3). 질문 건당 과금(§5-2), 공개질문 수임 게이트(§5-9),
 * 채택 시 답변 급여 적격(pay_eligible) — payroll 정산에서 합산.
 */
@Injectable()
export class QnaService {
  private readonly logger = new Logger('Qna');

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly credit: CreditService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
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
            attachments: (dto.attachments ?? []) as unknown as Prisma.InputJsonValue,
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
        include: { teacher_profile: { include: { account: { select: { name: true } } } } },
      },
    };
    const shape = (rows: Awaited<ReturnType<typeof this.prisma.qna_post.findMany>>) =>
      (rows as unknown as QnaRow[]).map((p) => ({
        id: p.id,
        subject: p.subject ?? null,
        difficulty: p.difficulty ?? null,
        scope: p.scope ?? 'open',
        assignedTeacherId: p.assigned_teacher_id ?? null,
        body: p.body ?? '',
        status: p.status ?? 'open',
        created_at: p.created_at,
        rating: p.rating ?? null,
        continuePref: p.continue_pref ?? null,
        attachments: Array.isArray(p.attachments)
          ? (p.attachments as { id: string; name: string; type?: string }[])
          : [],
        answers: (p.qna_answer ?? []).map((a) => ({
          id: a.id,
          body: a.body ?? '',
          accepted: !!a.accepted,
          teacherId: a.teacher_id ?? null,
          teacherName: a.teacher_profile?.account?.name ?? '선생님',
          createdAt: a.created_at,
        })),
      }));

    if (user.role === AccountRole.STUDENT) {
      return shape(await this.prisma.qna_post.findMany({ where: { student_id: user.id }, orderBy: { created_at: 'desc' }, include: answersInclude }));
    }
    if (user.role === AccountRole.TEACHER) {
      // Q1: 나를 소프트 블록한 학생의 질문은 화면·배정 큐에서 제외(사유 비노출).
      const blocks = await this.prisma.qna_relation_block.findMany({ where: { teacher_id: user.id }, select: { student_id: true } });
      const blockedStudents = blocks.map((b) => b.student_id);
      return shape(await this.prisma.qna_post.findMany({
        where: {
          AND: [
            { OR: [{ scope: 'open', status: 'open' }, { assigned_teacher_id: user.id }] },
            ...(blockedStudents.length ? [{ student_id: { notIn: blockedStudents } }] : []),
          ],
        },
        orderBy: { created_at: 'desc' }, include: answersInclude,
      }));
    }
    if (user.role === AccountRole.ADMIN || user.role === AccountRole.HR) {
      return shape(await this.prisma.qna_post.findMany({ orderBy: { created_at: 'desc' }, take: 200, include: answersInclude }));
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
    // Q1 소프트 블록: 학생이 이 선생님을 차단했으면 가져갈 수 없음(사유 비노출).
    const blocked = await this.prisma.qna_relation_block.findUnique({
      where: { student_id_teacher_id: { student_id: post.student_id, teacher_id: teacher.id } },
    });
    if (blocked) throw new NotFoundException('질문을 찾을 수 없습니다.');
    // 선착순: scope=open·미배정일 때만 1건 전환. 경쟁 시 count!==1 → 409. claimed_at 기록(SLA).
    const upd = await this.prisma.qna_post.updateMany({
      where: {
        id: postId,
        scope: 'open',
        status: 'open',
        assigned_teacher_id: null,
      },
      data: { scope: 'assigned', assigned_teacher_id: teacher.id, claimed_at: new Date() },
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
      priors: priorRows.filter((r) => r.body).map((r) => ({ id: r.id, body: r.body! })),
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
    // Q1 SLA: 최초 응답 시각(1회만).
    if (post.first_reply_at == null) {
      await this.prisma.qna_post.update({ where: { id: postId }, data: { first_reply_at: new Date() } });
    }
    return { id: ans.id, postId, accepted: false, simFlagged: sim.flagged, similarity: sim.maxSimilarity, simSummary: sim.summary };
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
        data: { status: 'resolved', resolved_at: new Date() }, // Q1 SLA: 해결 시각
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

  /** Q1 해결 피드백(질문 학생) — 만족도(1~5)+계속 여부. continue=false 면 채택 답변 선생님을 소프트 블록. */
  async feedback(student: AuthUser, postId: string, dto: { rating?: number; continuePref?: boolean }) {
    const post = await this.prisma.qna_post.findUnique({
      where: { id: postId },
      include: { qna_answer: { where: { accepted: true }, take: 1, select: { teacher_id: true } } },
    });
    if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');
    if (post.student_id !== student.id) throw new ForbiddenException('본인 질문만 평가할 수 있습니다.');
    if (post.status !== 'resolved') throw new BadRequestException('해결된 질문만 평가할 수 있습니다.');
    const rating = dto.rating != null ? Math.min(5, Math.max(1, Math.round(dto.rating))) : null;
    await this.prisma.qna_post.update({ where: { id: postId }, data: { rating, continue_pref: dto.continuePref ?? null } });
    let blockedTeacher = false;
    const teacherId = post.qna_answer[0]?.teacher_id;
    if (dto.continuePref === false && teacherId) {
      await this.prisma.qna_relation_block.upsert({
        where: { student_id_teacher_id: { student_id: student.id, teacher_id: teacherId } },
        create: { student_id: student.id, teacher_id: teacherId },
        update: {},
      });
      blockedTeacher = true;
    }
    return { postId, rating, continuePref: dto.continuePref ?? null, blockedTeacher };
  }

  /** 소프트 블록 설정/해제(학생) — 선생님에게 비공지. */
  async setBlock(student: AuthUser, teacherId: string, blocked: boolean) {
    if (student.role !== AccountRole.STUDENT) throw new ForbiddenException('학생만 설정할 수 있습니다.');
    if (blocked) {
      await this.prisma.qna_relation_block.upsert({
        where: { student_id_teacher_id: { student_id: student.id, teacher_id: teacherId } },
        create: { student_id: student.id, teacher_id: teacherId },
        update: {},
      });
    } else {
      await this.prisma.qna_relation_block.deleteMany({ where: { student_id: student.id, teacher_id: teacherId } });
    }
    return { teacherId, blocked };
  }

  /** 내 소프트 블록 목록(학생) — 해제 UI 용. */
  async myBlocks(student: AuthUser) {
    if (student.role !== AccountRole.STUDENT) throw new ForbiddenException('학생만 조회할 수 있습니다.');
    const blocks = await this.prisma.qna_relation_block.findMany({ where: { student_id: student.id }, orderBy: { created_at: 'desc' } });
    if (!blocks.length) return { blocks: [] as Array<{ teacherId: string; teacherName: string; since: Date }> };
    const accounts = await this.prisma.account.findMany({ where: { id: { in: blocks.map((b) => b.teacher_id) } }, select: { id: true, name: true } });
    const nameOf = new Map(accounts.map((a) => [a.id, a.name]));
    return { blocks: blocks.map((b) => ({ teacherId: b.teacher_id, teacherName: nameOf.get(b.teacher_id) ?? '선생님', since: b.created_at })) };
  }

  /** Q1 SLA 풀별 집계(admin/hr) — 접수→클레임→첫응답→해결 지연·해결률. */
  async sla(user: AuthUser) {
    if (user.role !== AccountRole.ADMIN && user.role !== AccountRole.HR) throw new ForbiddenException('관리자만 조회할 수 있습니다.');
    const rows = await this.prisma.qna_post.findMany({
      select: { scope: true, created_at: true, claimed_at: true, first_reply_at: true, resolved_at: true },
    });
    const pools = computeSla(
      rows.map((r) => ({
        pool: r.scope ?? 'open',
        createdAt: r.created_at.getTime(),
        claimedAt: r.claimed_at?.getTime() ?? null,
        firstReplyAt: r.first_reply_at?.getTime() ?? null,
        resolvedAt: r.resolved_at?.getTime() ?? null,
      })),
    );
    return { pools };
  }

  // ── 강제배정 상태기계(§1-2 배정 루프, 감사 우선순위 2) ──────────────────
  /** 10분마다: 방치된 클레임 재개방 + 오래된 공개질문 강제배정. cron-lock 으로 다중 인스턴스 안전. */
  @Cron('*/10 * * * *', { timeZone: 'Asia/Seoul' })
  async scheduledSweep() {
    await withCronLock(this.cache, 'qna-sweep', 300, async () => {
      const r = await this.sweep();
      if (r.released || r.assigned) this.logger.log(`Q&A 스윕: 재개방 ${r.released} · 강제배정 ${r.assigned}`);
    }, this.logger);
  }

  /** 재개방 + 강제배정 1회(관리자 수동 트리거도 이 경로). */
  async sweep(ttlMin = CLAIM_TTL_MIN, maxAgeMin = OPEN_AGE_MIN) {
    const released = await this.releaseStaleClaims(ttlMin);
    const assigned = await this.autoAssignOpen(maxAgeMin, SWEEP_LIMIT);
    return { released, assigned };
  }

  /** 클레임 TTL: 가져간 뒤 첫 응답 없이 ttlMin 경과한 질문을 공개로 되돌린다(지정 질문은 claimed_at NULL 이라 제외). */
  async releaseStaleClaims(ttlMin: number): Promise<number> {
    const cutoff = new Date(Date.now() - ttlMin * 60_000);
    const res = await this.prisma.qna_post.updateMany({
      where: { scope: 'assigned', status: 'open', first_reply_at: null, claimed_at: { lt: cutoff } },
      data: { scope: 'open', assigned_teacher_id: null, claimed_at: null },
    });
    return res.count;
  }

  /** 미배정 공개질문(생성 후 maxAgeMin 경과) → 자격 있는 전임 중 최소 부하에게 강제배정(claimed_at 기록). */
  async autoAssignOpen(maxAgeMin: number, limit: number): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMin * 60_000);
    const opens = await this.prisma.qna_post.findMany({
      where: { scope: 'open', status: 'open', assigned_teacher_id: null, created_at: { lt: cutoff } },
      orderBy: { created_at: 'asc' }, take: limit,
      select: { id: true, student_id: true },
    });
    let assigned = 0;
    for (const q of opens) {
      const teacherId = await this.pickForStudent(q.student_id);
      if (!teacherId) continue;
      const upd = await this.prisma.qna_post.updateMany({
        where: { id: q.id, scope: 'open', status: 'open', assigned_teacher_id: null },
        data: { scope: 'assigned', assigned_teacher_id: teacherId, claimed_at: new Date() },
      });
      if (upd.count === 1) assigned += 1;
    }
    return assigned;
  }

  /** 학생에게 배정 가능한 전임 선택 — 같은 센터·근무중, unfit·소프트블록 제외, 최소 부하. */
  private async pickForStudent(studentId: string): Promise<string | null> {
    const sp = await this.prisma.student_profile.findUnique({ where: { account_id: studentId }, select: { center_id: true } });
    if (!sp?.center_id) return null;
    const teachers = await this.prisma.teacher_profile.findMany({ where: { center_id: sp.center_id, work_status: 'on' }, select: { account_id: true } });
    const ids = teachers.map((t) => t.account_id);
    if (!ids.length) return null;
    const [unfit, blocks] = await Promise.all([
      this.prisma.teacher_list_entry.findMany({ where: { student_id: studentId, teacher_id: { in: ids }, list_kind: 'unfit' }, select: { teacher_id: true } }),
      this.prisma.qna_relation_block.findMany({ where: { student_id: studentId, teacher_id: { in: ids } }, select: { teacher_id: true } }),
    ]);
    const excluded = new Set([...unfit.map((u) => u.teacher_id), ...blocks.map((b) => b.teacher_id)]);
    const eligible = ids.filter((id) => !excluded.has(id));
    if (!eligible.length) return null;
    const loads = await this.prisma.qna_post.groupBy({
      by: ['assigned_teacher_id'],
      where: { assigned_teacher_id: { in: eligible }, scope: 'assigned', status: 'open', first_reply_at: null },
      _count: { _all: true },
    });
    const loadMap = new Map(loads.map((l) => [l.assigned_teacher_id as string, l._count._all]));
    return pickAssignee(eligible.map((id) => ({ teacherId: id, load: loadMap.get(id) ?? 0 })));
  }
}
