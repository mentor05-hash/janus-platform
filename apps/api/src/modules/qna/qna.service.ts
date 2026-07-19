import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import { withCronLock } from '../../common/cache/cron-lock';
import { ShortfallError } from '../../common/errors/shortfall.error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { detectDirectContact, DIRECT_CONTACT_WARNING } from '../../common/moderation/direct-contact';
import { kstDateString } from '../../common/time/kst';
import { AccountRole, ConsultMode, ConsultType, TeacherGrade } from '../../config/enums';
import { AvailabilityService } from '../availability/availability.service';
import { BookingService } from '../booking/booking.service';
import { CreditService } from '../billing/credit.service';
import { PricingService } from '../pricing-policy/pricing.service';
import { canAnswerQuestion, QnaScope } from './domain/qna';
import { computeSla } from './domain/qna-sla';
import { pickAssignee } from './domain/qna-assign';
import { COMMUNITY_DAILY_LIMIT, aiUnlabeled, canAnswerCommunity, shouldHide, withinDailyLimit } from './domain/qna-community';
import { DEFAULT_LEAGUE_POLICY, TIER_LABEL, evaluateLeague, nextTierNeed, type LeaguePolicy } from './domain/qna-league';
import { NotifyService } from '../notification/notify.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateAnswerDto, CreateQuestionDto } from './dto/qna.dto';
import { Inject } from '@nestjs/common';
import { LLM_PROVIDER } from '../llm/llm.types';
import type { LlmProvider } from '../llm/llm.types';

// 강제배정 상태기계 임계값(§1-2 배정 루프). 운영 중 필요 시 정책값으로 승격.
const CLAIM_TTL_MIN = 30; // 클레임 후 이 시간까지 첫 응답 없으면 재개방
const OPEN_AGE_MIN = 15; // 공개(미배정) 질문이 이 시간 지나면 강제배정
const SWEEP_LIMIT = 50; // 1회 스윕당 강제배정 상한
const REANSWER_LIMIT = 3; // 재답변 요청 한도(qa.reanswerLimit — 정책값화는 후속)
const ESCALATE_HORIZON_DAYS = 7; // 상담 승격 시 빈 슬롯 탐색 범위
const ESCALATE_SLOT_MIN = 10; // 슬롯 단위(분)

/** need 개 연속 'free' 슬롯의 시작 인덱스(없으면 null). */
function firstFreeRun(statuses: string[], need: number): number | null {
  let run = 0;
  for (let i = 0; i < statuses.length; i++) {
    if (statuses[i] === 'free') { run += 1; if (run >= need) return i - need + 1; }
    else run = 0;
  }
  return null;
}

interface QnaRow {
  id: string; subject: string | null; difficulty: string | null; scope: string | null;
  body: string | null; status: string | null; created_at: Date; assigned_teacher_id?: string | null;
  attachments?: unknown; rating?: number | null; continue_pref?: boolean | null;
  ai_draft?: string | null; ai_draft_at?: Date | null;
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
    private readonly booking: BookingService,
    private readonly availability: AvailabilityService,
    private readonly notify: NotifyService,
    @Optional() private readonly realtime?: RealtimeGateway,
  ) {}

  /** 질문 요금 안내(학생) — 문항형/일반형 건당 크레딧 + 주간 무료 질문권 잔여. 센터별 정책 반영. */
  async pricingInfo(centerId: string | null, studentId?: string) {
    const [item, general] = await Promise.all([
      this.pricing.quoteBoard('item', centerId),
      this.pricing.quoteBoard('general', centerId),
    ]);
    const free = studentId ? await this.freeQuotaStatus(studentId) : null;
    return { itemFee: item.credits, generalFee: general.credits, freeQuota: free };
  }

  /** C1 직거래·연락처 감지 기록(audit_log 재사용) — 실패 비차단. 반환: 경고 문구 또는 null. */
  private async moderate(actor: AuthUser, context: string, refId: string, text: string | null | undefined): Promise<string | null> {
    const kinds = detectDirectContact(text);
    if (kinds.length === 0) return null;
    try {
      await this.prisma.audit_log.create({
        data: {
          actor_id: actor.id, actor_role: actor.role,
          action: 'moderation_flag', target_type: context, target_id: refId,
          summary: (text ?? '').slice(0, 120), meta: { kinds } as object,
          center_id: actor.centerId ?? null,
        },
      });
    } catch { /* 기록 실패는 삼킨다 */ }
    return DIRECT_CONTACT_WARNING;
  }

  // ── P1(큐브 벤치마크): 주간 무료 질문권 — 구독 등급 번들. 수치는 system_setting(관리자 조정) ──
  private static readonly FREE_QUOTA_KEY = 'qa_free_quota';
  private static readonly FREE_QUOTA_DEFAULT = { premiumWeekly: 3, defaultWeekly: 0 }; // N23~25 확정 시 조정

  /** 이번 주(KST 월요일 00:00) 시작 시각. */
  private weekStartKst(): Date {
    const kst = new Date(Date.now() + 9 * 3600_000);
    const day = (kst.getUTCDay() + 6) % 7; // 월=0
    const monday = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - day);
    return new Date(monday - 9 * 3600_000);
  }

  /** 주간 무료 질문권 상태 — 프리미엄 등급(tier≥3·이름 폴백, realtime 게이팅과 동일 규칙) 기준. */
  async freeQuotaStatus(studentId: string): Promise<{ quota: number; used: number; remaining: number; resetsAt: string }> {
    const row = await this.prisma.system_setting.findUnique({ where: { key: QnaService.FREE_QUOTA_KEY } });
    const cfg = { ...QnaService.FREE_QUOTA_DEFAULT, ...((row?.value as object) ?? {}) } as { premiumWeekly: number; defaultWeekly: number };
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: studentId },
      select: { membership_grade: { select: { name: true, tier: true } } },
    });
    const g = sp?.membership_grade;
    const premium = (g?.tier ?? 0) >= 3 || /premium|프리미엄/i.test(g?.name ?? '');
    const quota = Math.max(0, premium ? cfg.premiumWeekly : cfg.defaultWeekly);
    const weekStart = this.weekStartKst();
    const used = quota > 0
      ? await this.prisma.qna_post.count({ where: { student_id: studentId, free_used: true, created_at: { gte: weekStart } } })
      : 0;
    const resetsAt = new Date(weekStart.getTime() + 7 * 24 * 3600_000).toISOString();
    return { quota, used, remaining: Math.max(0, quota - used), resetsAt };
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
    // P1: 주간 무료 질문권 먼저 소진, 그다음 크레딧 과금. (동시 등록 레이스는 소폭 초과 허용 — 쿼터는 혜택이지 하드캡 아님)
    const freeQ = await this.freeQuotaStatus(student.id);
    const useFree = freeQ.remaining > 0;
    const credits = useFree ? 0 : quote.credits;

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
            free_used: useFree,
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
      // Q3: 질문 등록 즉시 AI 1차 초안 자동 생성(비동기·비용상한·실패 무해).
      void this.generateAiDraft(post.id, { subject: dto.subject ?? null, difficulty: dto.difficulty ?? null, body: dto.body });
      const moderationWarning = await this.moderate(student, 'qna_post', post.id, dto.body);
      return {
        id: post.id,
        scope: post.scope,
        status: post.status,
        chargedCredits: credits,
        freeUsed: useFree,
        freeRemaining: useFree ? freeQ.remaining - 1 : freeQ.remaining,
        moderationWarning,
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
        aiDraft: p.ai_draft ?? null,
        aiDraftAt: p.ai_draft_at ?? null,
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
          attachments: Array.isArray((a as { attachments?: unknown }).attachments)
            ? ((a as { attachments?: unknown }).attachments as { id: string; name: string; type?: string }[])
            : [],
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
    // 재답변 요청된 질문: 이전 답변자는 다시 가져갈 수 없음(제외 후 재공개).
    if (post.reanswer_count > 0) {
      const answered = await this.prisma.qna_answer.findFirst({ where: { post_id: postId, teacher_id: teacher.id }, select: { id: true } });
      if (answered) throw new ForbiddenException('재답변 요청된 질문입니다 — 이전 답변자는 다시 답할 수 없습니다.');
    }
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
    // 재답변 요청된 질문: 이전 답변자 제외.
    if (post.reanswer_count > 0) {
      const already = await this.prisma.qna_answer.findFirst({ where: { post_id: postId, teacher_id: teacher.id }, select: { id: true } });
      if (already) throw new ForbiddenException('재답변 요청된 질문입니다 — 이전 답변자는 다시 답할 수 없습니다.');
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
        attachments: (dto.attachments ?? []) as unknown as Prisma.InputJsonValue, // P4 화이트보드 풀이 등
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
    const moderationWarning = await this.moderate(teacher, 'qna_answer', ans.id, dto.body);
    return { id: ans.id, postId, accepted: false, simFlagged: sim.flagged, similarity: sim.maxSimilarity, simSummary: sim.summary, moderationWarning };
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

  /** P5(큐브 벤치마크): 지정 질문용 선생님 디렉터리 — 공개 SLA 배지(평균 첫응답·만족도·답변 실적) 포함.
   *  학생의 소프트 블록 대상은 제외(§1-3 양방향 필터). */
  async teacherDirectory(student: AuthUser) {
    if (student.role !== AccountRole.STUDENT) throw new ForbiddenException('학생만 조회할 수 있습니다.');
    const blocked = await this.prisma.qna_relation_block.findMany({
      where: { student_id: student.id }, select: { teacher_id: true },
    });
    const blockedSet = new Set(blocked.map((b) => b.teacher_id));
    const teachers = await this.prisma.teacher_profile.findMany({
      select: { account_id: true, account: { select: { name: true } } },
      take: 100,
    });
    // 풀별 원칙(§2): 배지는 지정(assigned) 풀 기준 첫응답·만족도 + 전체 답변 실적(채택 수).
    const [slaRows, ansRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ tid: string; answered: number; avg_first_min: number | null; avg_rating: number | null }>>`
        SELECT p.assigned_teacher_id AS tid,
               count(*) FILTER (WHERE p.first_reply_at IS NOT NULL)::int AS answered,
               avg(EXTRACT(EPOCH FROM (p.first_reply_at - p.created_at)) / 60) FILTER (WHERE p.first_reply_at IS NOT NULL) AS avg_first_min,
               avg(p.rating) FILTER (WHERE p.rating IS NOT NULL) AS avg_rating
        FROM qna_post p
        WHERE p.assigned_teacher_id IS NOT NULL
        GROUP BY 1`,
      this.prisma.$queryRaw<Array<{ tid: string; answers: number; accepted: number }>>`
        SELECT a.teacher_id AS tid, count(*)::int AS answers, count(*) FILTER (WHERE a.accepted)::int AS accepted
        FROM qna_answer a GROUP BY 1`,
    ]);
    const sla = new Map(slaRows.map((r) => [r.tid, r]));
    const ans = new Map(ansRows.map((r) => [r.tid, r]));
    return {
      teachers: teachers
        .filter((t) => !blockedSet.has(t.account_id))
        .map((t) => {
          const s = sla.get(t.account_id); const a = ans.get(t.account_id);
          return {
            teacherId: t.account_id,
            name: t.account?.name ?? '선생님',
            avgFirstReplyMin: s?.avg_first_min != null ? Math.round(Number(s.avg_first_min)) : null,
            avgRating: s?.avg_rating != null ? Math.round(Number(s.avg_rating) * 10) / 10 : null,
            answers: a?.answers ?? 0,
            accepted: a?.accepted ?? 0,
          };
        })
        // 실적 있는 선생님 우선(첫응답 빠른 순), 무실적은 뒤에 이름순
        .sort((x, y) => {
          if (x.avgFirstReplyMin == null && y.avgFirstReplyMin == null) return x.name.localeCompare(y.name);
          if (x.avgFirstReplyMin == null) return 1;
          if (y.avgFirstReplyMin == null) return -1;
          return x.avgFirstReplyMin - y.avgFirstReplyMin;
        }),
    };
  }

  /** P5: 학생 홈 위젯 — 진행 중인 내 질문 요약(최근 5건). */
  async myOpenQuestions(student: AuthUser) {
    if (student.role !== AccountRole.STUDENT) return { posts: [] };
    const rows = await this.prisma.qna_post.findMany({
      where: { student_id: student.id, status: 'open' },
      orderBy: { created_at: 'desc' }, take: 5,
      select: {
        id: true, subject: true, scope: true, created_at: true, first_reply_at: true,
        _count: { select: { qna_answer: true } },
      },
    });
    return {
      posts: rows.map((r) => ({
        id: r.id, subject: r.subject, scope: r.scope, createdAt: r.created_at,
        answered: r.first_reply_at != null, answerCount: r._count.qna_answer,
      })),
    };
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

  // ── 불만족 후속 경로(§1-4, 감사 우선순위 3) ─────────────────────────────
  /** 재답변 요청(질문 학생) — 답변에 불만족 시 이전 답변자 제외하고 재공개. 한도 REANSWER_LIMIT. */
  async requestReanswer(student: AuthUser, postId: string, reason?: string) {
    const post = await this.prisma.qna_post.findUnique({ where: { id: postId }, include: { qna_answer: { select: { id: true }, take: 1 } } });
    if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');
    if (post.student_id !== student.id) throw new ForbiddenException('본인 질문만 재답변 요청할 수 있습니다.');
    if ((post.qna_answer?.length ?? 0) === 0) throw new BadRequestException('아직 답변이 없어 재답변을 요청할 수 없습니다.');
    if (post.status !== 'open') throw new BadRequestException('진행 중인 질문만 재답변을 요청할 수 있습니다(채택 후에는 불가).');
    if (post.reanswer_count >= REANSWER_LIMIT) throw new BadRequestException(`재답변은 최대 ${REANSWER_LIMIT}회까지 요청할 수 있습니다.`);
    await this.prisma.qna_post.update({
      where: { id: postId },
      data: {
        reanswer_count: { increment: 1 }, reanswer_reason: reason ?? null,
        scope: 'open', assigned_teacher_id: null, claimed_at: null, first_reply_at: null, // 재공개 + SLA 리셋
      },
    });
    const count = post.reanswer_count + 1;
    return { postId, reanswerCount: count, remaining: REANSWER_LIMIT - count };
  }

  /** 상담 승격(질문 학생) — 답변 선생님에게 질문·답변 컨텍스트를 담아 상담 예약 생성(가까운 빈 슬롯). */
  async escalate(student: AuthUser, postId: string) {
    const post = await this.prisma.qna_post.findUnique({
      where: { id: postId },
      include: { qna_answer: { orderBy: { created_at: 'desc' }, take: 1, select: { teacher_id: true, body: true } } },
    });
    if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');
    if (post.student_id !== student.id) throw new ForbiddenException('본인 질문만 상담으로 이어갈 수 있습니다.');
    if (post.escalated_booking_id) return { bookingId: post.escalated_booking_id, already: true };
    const ans = post.qna_answer[0];
    const teacherId = ans?.teacher_id ?? post.assigned_teacher_id;
    if (!teacherId) throw new BadRequestException('답변한 선생님이 없어 상담으로 이어갈 수 없습니다.');
    const tp = await this.prisma.teacher_profile.findUnique({ where: { account_id: teacherId }, select: { center_id: true, grade: true } });
    if (!tp) throw new NotFoundException('선생님 정보를 찾을 수 없습니다.');

    const minutes = await this.booking.defaultMinutes('subject');
    const need = Math.max(1, Math.round(minutes / ESCALATE_SLOT_MIN));
    const content = `Q&A 상담 승격 — 질문: ${(post.body ?? '').slice(0, 120)}${ans?.body ? `\n이전 답변 요약: ${ans.body.slice(0, 120)}` : ''}`;
    const now = new Date();
    for (let d = 0; d < ESCALATE_HORIZON_DAYS; d++) {
      const dateStr = kstDateString(new Date(now.getTime() + d * 86_400_000));
      const slots = await this.availability.getDaySlots(teacherId, dateStr, student.id);
      const start = firstFreeRun(slots.map((sl) => sl.status), need);
      if (start === null) continue;
      const res = await this.booking.createAssigned({
        studentId: student.id, teacherId, centerId: tp.center_id,
        teacherGrade: (tp.grade as TeacherGrade) ?? TeacherGrade.B,
        consultType: ConsultType.SUBJECT, mode: ConsultMode.CHAT, dateStr,
        slotStart: slots[start].index, slotEnd: slots[start].index + need,
        charge: 'session', origin: '질문승격', content,
      });
      if (res.ok && res.bookingId) {
        await this.prisma.qna_post.update({ where: { id: postId }, data: { escalated_booking_id: res.bookingId } });
        return { bookingId: res.bookingId };
      }
      if (res.reason === 'shortfall') {
        return { ok: false, reason: 'shortfall', message: '크레딧이 부족해 상담 예약을 생성하지 못했어요. 충전 후 다시 시도하거나 상담 예약에서 직접 진행하세요.' };
      }
    }
    return { ok: false, reason: 'no_slot', message: '가까운 빈 시간을 찾지 못했어요. 상담 예약에서 직접 시간을 골라주세요.' };
  }

  // ── Q3 커뮤니티(3부 공개 게시판) ───────────────────────────────────────
  /** 커뮤니티 질문 등록(무료·일 3건) — 등록 즉시 AI 초안. */
  async createCommunityQuestion(user: AuthUser, dto: { subject?: string; difficulty?: string; body: string }) {
    if (user.role !== AccountRole.STUDENT) throw new ForbiddenException('학생만 커뮤니티 질문을 등록할 수 있습니다.');
    const key = `qna:comm:${user.id}:${new Date().toISOString().slice(0, 10)}`;
    const used = Number((await this.cache.get<number>(key)) ?? 0);
    if (!withinDailyLimit(used)) throw new BadRequestException(`커뮤니티 질문은 하루 ${COMMUNITY_DAILY_LIMIT}건까지 등록할 수 있어요.`);
    const post = await this.prisma.qna_post.create({
      data: { student_id: user.id, subject: dto.subject ?? null, difficulty: dto.difficulty ?? null, scope: 'open', status: 'open', community: true, body: dto.body },
    });
    await this.cache.incr(key, 26 * 3600);
    void this.generateAiDraft(post.id, { subject: dto.subject ?? null, difficulty: dto.difficulty ?? null, body: dto.body });
    return { id: post.id, community: true };
  }

  /** 커뮤니티 목록(로그인 전원) — 미답변 필터·과목·검색·숨김 제외. */
  async listCommunity(_user: AuthUser, opts?: { filter?: 'unanswered'; subject?: string; q?: string }) {
    const term = (opts?.q ?? '').trim();
    const posts = await this.prisma.qna_post.findMany({
      where: {
        community: true, hidden: false,
        ...(opts?.subject ? { subject: opts.subject } : {}),
        ...(term ? { OR: [{ subject: { contains: term, mode: 'insensitive' } }, { body: { contains: term, mode: 'insensitive' } }] } : {}),
      },
      orderBy: { created_at: 'desc' }, take: 100,
      select: { id: true, subject: true, difficulty: true, body: true, status: true, created_at: true, ai_draft: true },
    });
    const ids = posts.map((p) => p.id);
    const counts = ids.length ? await this.prisma.qna_community_answer.groupBy({ by: ['post_id'], where: { post_id: { in: ids }, hidden: false }, _count: { _all: true } }) : [];
    const cmap = new Map(counts.map((c) => [c.post_id, c._count._all]));
    let list = posts.map((p) => ({
      id: p.id, subject: p.subject, difficulty: p.difficulty, body: p.body ?? '', status: p.status ?? 'open',
      createdAt: p.created_at, answerCount: cmap.get(p.id) ?? 0, hasAiDraft: !!p.ai_draft,
    }));
    if (opts?.filter === 'unanswered') list = list.filter((p) => p.answerCount === 0);
    return list;
  }

  /** 커뮤니티 상세 — 질문 + AI 초안 + (숨김 제외) 답변 목록(작성자명·채택). */
  async getCommunity(user: AuthUser, postId: string) {
    const post = await this.prisma.qna_post.findUnique({ where: { id: postId } });
    if (!post || !post.community || post.hidden) throw new NotFoundException('질문을 찾을 수 없습니다.');
    const answers = await this.prisma.qna_community_answer.findMany({ where: { post_id: postId, hidden: false }, orderBy: [{ accepted: 'desc' }, { created_at: 'asc' }] });
    const authorIds = [...new Set(answers.map((a) => a.author_id))];
    const accounts = authorIds.length ? await this.prisma.account.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, role: true } }) : [];
    const info = new Map(accounts.map((a) => [a.id, a]));
    return {
      id: post.id, subject: post.subject, difficulty: post.difficulty, body: post.body ?? '', status: post.status ?? 'open',
      isOwner: post.student_id === user.id, aiDraft: post.ai_draft ?? null, createdAt: post.created_at,
      answers: answers.map((a) => ({
        id: a.id, body: a.body ?? '', accepted: a.accepted, aiSimilar: a.ai_similar,
        authorName: info.get(a.author_id)?.name ?? '익명', authorRole: info.get(a.author_id)?.role ?? null,
        mine: a.author_id === user.id, createdAt: a.created_at,
      })),
    };
  }

  /** 커뮤니티 답변(전원·무정산) — AI 초안 유사 시 미표기 경고. */
  async answerCommunity(user: AuthUser, postId: string, body: string) {
    const post = await this.prisma.qna_post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');
    const gate = canAnswerCommunity({ community: post.community, hidden: post.hidden, status: post.status ?? 'open', ownerId: post.student_id, userId: user.id });
    if (!gate.allowed) {
      const msg = gate.reason === 'owner' ? '본인 질문에는 답변할 수 없습니다.' : gate.reason === 'resolved' ? '이미 채택/마감된 질문입니다.' : gate.reason === 'hidden' ? '숨김 처리된 질문입니다.' : '커뮤니티 질문이 아닙니다.';
      throw new ForbiddenException(msg);
    }
    let similarity = 0; let aiSim = false;
    if (post.ai_draft) {
      const sim = await this.llm.checkAnswerSimilarity({ body, priors: [{ id: 'ai', body: post.ai_draft }] });
      similarity = sim.maxSimilarity; aiSim = aiUnlabeled(sim.maxSimilarity);
    }
    const ans = await this.prisma.qna_community_answer.create({ data: { post_id: postId, author_id: user.id, body, similarity, ai_similar: aiSim } });
    if (post.first_reply_at == null) await this.prisma.qna_post.update({ where: { id: postId }, data: { first_reply_at: new Date() } });
    void this.notify.notify(post.student_id, 'qna_community_answer', { postId }); // 질문자에게 새 답변 알림
    this.realtime?.emitToCommunity(postId, 'community:answer', { postId, answerId: ans.id }); // 열람 중 사용자 실시간 갱신
    return { id: ans.id, aiSimilar: aiSim, similarity, warning: aiSim ? 'AI 초안과 매우 유사합니다 — AI 도움을 받았다면 "AI 참고"로 표기해 주세요.' : null };
  }

  /** 커뮤니티 답변 채택(질문 학생, 단일) — 답변 accepted + 질문 resolved. */
  async acceptCommunityAnswer(user: AuthUser, answerId: string) {
    const ans = await this.prisma.qna_community_answer.findUnique({ where: { id: answerId } });
    if (!ans) throw new NotFoundException('답변을 찾을 수 없습니다.');
    const post = await this.prisma.qna_post.findUnique({ where: { id: ans.post_id } });
    if (!post || post.student_id !== user.id) throw new ForbiddenException('본인 질문의 답변만 채택할 수 있습니다.');
    await this.prisma.$transaction(async (tx) => {
      const upd = await tx.qna_post.updateMany({ where: { id: ans.post_id, status: 'open' }, data: { status: 'resolved', resolved_at: new Date() } });
      if (upd.count !== 1) throw new ConflictException('이미 채택/마감된 질문입니다.');
      await tx.qna_community_answer.update({ where: { id: answerId }, data: { accepted: true } });
    });
    void this.notify.notify(ans.author_id, 'qna_community_accepted', { answerId }); // 답변자에게 채택 알림
    this.realtime?.emitToCommunity(ans.post_id, 'community:accepted', { postId: ans.post_id, answerId }); // 열람 중 사용자 실시간 갱신
    const league = await this.evaluateLeagueFor(ans.author_id); // 채택 → 답변자 리그 재평가(승급·승급 시 알림)
    return { id: answerId, accepted: true, authorLeague: league.tier, promoted: league.promoted };
  }

  /** 신고(로그인 전원) — 대상별 1회, 누적 3건 시 자동 숨김. */
  async reportContent(user: AuthUser, dto: { targetType: 'post' | 'answer'; targetId: string; reason?: string }) {
    try {
      await this.prisma.qna_report.create({ data: { target_type: dto.targetType, target_id: dto.targetId, reporter_id: user.id, reason: dto.reason ?? null } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('이미 신고한 대상입니다.');
      throw e;
    }
    if (dto.targetType === 'post') {
      const u = await this.prisma.qna_post.update({ where: { id: dto.targetId }, data: { report_count: { increment: 1 } }, select: { report_count: true } });
      if (shouldHide(u.report_count)) await this.prisma.qna_post.update({ where: { id: dto.targetId }, data: { hidden: true } });
    } else {
      const u = await this.prisma.qna_community_answer.update({ where: { id: dto.targetId }, data: { report_count: { increment: 1 } }, select: { report_count: true } });
      if (shouldHide(u.report_count)) await this.prisma.qna_community_answer.update({ where: { id: dto.targetId }, data: { hidden: true } });
    }
    return { ok: true };
  }

  /** 커뮤니티 실적(본인 또는 지정) — 답변 수·채택 수·채택률(리그 승급 기반). */
  async communityStats(user: AuthUser, authorId?: string) {
    const id = authorId ?? user.id;
    const [authored, accepted] = await Promise.all([
      this.prisma.qna_community_answer.count({ where: { author_id: id, hidden: false } }),
      this.prisma.qna_community_answer.count({ where: { author_id: id, accepted: true } }),
    ]);
    return { authored, accepted, acceptRate: authored ? Math.round((accepted / authored) * 100) : 0 };
  }

  // ── Q3 리그(3부→2부→1부) ─────────────────────────────────────────────
  private static readonly LEAGUE_POLICY_KEY = 'qna_league_policy';

  /** 승급 정책값 — system_setting override + 코드 기본값(N27 확정 전). */
  async getLeaguePolicy(): Promise<LeaguePolicy> {
    const row = await this.prisma.system_setting.findUnique({ where: { key: QnaService.LEAGUE_POLICY_KEY } });
    const v = (row?.value ?? null) as Partial<LeaguePolicy> | null;
    return {
      promote2: { ...DEFAULT_LEAGUE_POLICY.promote2, ...(v?.promote2 ?? {}) },
      promote1: { ...DEFAULT_LEAGUE_POLICY.promote1, ...(v?.promote1 ?? {}) },
    };
  }

  /** 승급 정책 설정(admin/hr). */
  async setLeaguePolicy(policy: LeaguePolicy) {
    await this.prisma.system_setting.upsert({
      where: { key: QnaService.LEAGUE_POLICY_KEY },
      create: { key: QnaService.LEAGUE_POLICY_KEY, value: policy as unknown as Prisma.InputJsonValue },
      update: { value: policy as unknown as Prisma.InputJsonValue },
    });
    return this.getLeaguePolicy();
  }

  /** 한 계정의 실적을 재평가해 qna_league 갱신(승급 시 promoted_at·플래그). */
  async evaluateLeagueFor(accountId: string): Promise<{ tier: number; promoted: boolean; authored: number; accepted: number; acceptRate: number }> {
    const stats = await this.communityStatsRaw(accountId);
    const policy = await this.getLeaguePolicy();
    const tier = evaluateLeague(stats, policy);
    const prev = await this.prisma.qna_league.findUnique({ where: { account_id: accountId } });
    const promoted = tier < (prev?.tier ?? 3); // 낮을수록 상위
    await this.prisma.qna_league.upsert({
      where: { account_id: accountId },
      create: { account_id: accountId, tier, authored: stats.authored, accepted: stats.accepted, accept_rate: stats.acceptRate, promoted_at: tier < 3 ? new Date() : null },
      update: { tier, authored: stats.authored, accepted: stats.accepted, accept_rate: stats.acceptRate, evaluated_at: new Date(), ...(promoted ? { promoted_at: new Date() } : {}) },
    });
    if (promoted) void this.notify.notify(accountId, 'qna_league_promoted', { tier, label: TIER_LABEL[tier] }); // 승급 알림
    return { tier, promoted, ...stats };
  }

  /** 실적 집계(내부) — communityStats 재사용용. */
  private async communityStatsRaw(accountId: string): Promise<{ authored: number; accepted: number; acceptRate: number }> {
    const [authored, accepted] = await Promise.all([
      this.prisma.qna_community_answer.count({ where: { author_id: accountId, hidden: false } }),
      this.prisma.qna_community_answer.count({ where: { author_id: accountId, accepted: true } }),
    ]);
    return { authored, accepted, acceptRate: authored ? Math.round((accepted / authored) * 100) : 0 };
  }

  /** 내 리그 현황 — 등급·라벨·다음 등급 요건·진행도(로그인 전원). */
  async myLeague(user: AuthUser) {
    const cur = await this.evaluateLeagueFor(user.id);
    const policy = await this.getLeaguePolicy();
    const next = nextTierNeed(cur.tier, policy);
    return {
      tier: cur.tier, label: TIER_LABEL[cur.tier], authored: cur.authored, accepted: cur.accepted, acceptRate: cur.acceptRate,
      next: next ? { tier: next.tier, label: TIER_LABEL[next.tier], rule: next.rule } : null,
    };
  }

  /** 리그 규칙 — 전체 티어 승급 요건(라이브 정책). 규칙 안내 페이지용(로그인 전원). */
  async leagueRules() {
    const policy = await this.getLeaguePolicy();
    return {
      tiers: [
        { tier: 3, label: TIER_LABEL[3], entry: true, rule: null },
        { tier: 2, label: TIER_LABEL[2], entry: false, rule: policy.promote2 },
        { tier: 1, label: TIER_LABEL[1], entry: false, rule: policy.promote1 },
      ],
    };
  }

  /** 리그 리더보드 — 상위 등급·채택수 순(로그인 전원). */
  async leaderboard(limit = 20) {
    const rows = await this.prisma.qna_league.findMany({
      where: { tier: { lt: 3 } }, orderBy: [{ tier: 'asc' }, { accepted: 'desc' }], take: Math.min(50, Math.max(1, limit)),
    });
    const ids = rows.map((r) => r.account_id);
    const accounts = ids.length ? await this.prisma.account.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, role: true } }) : [];
    const info = new Map(accounts.map((a) => [a.id, a]));
    return rows.map((r) => ({
      tier: r.tier, label: TIER_LABEL[r.tier], name: info.get(r.account_id)?.name ?? '익명',
      role: info.get(r.account_id)?.role ?? null, accepted: r.accepted, authored: r.authored, acceptRate: r.accept_rate,
    }));
  }

  /** Q3 AI 1차 초안 생성(비동기·일일 비용상한·실패 무해) → qna_post.ai_draft 저장. */
  private async generateAiDraft(postId: string, q: { subject: string | null; difficulty: string | null; body: string }) {
    try {
      const limit = Number(process.env.QNA_AI_DAILY_LIMIT ?? 200);
      const key = `qna:aidraft:${new Date().toISOString().slice(0, 10)}`; // 일자 러프 상한
      const used = Number((await this.cache.get<number>(key)) ?? 0);
      if (used >= limit) return;
      await this.cache.incr(key, 26 * 3600);
      const draft = await this.llm.draftAnswer({ subject: q.subject, difficulty: q.difficulty, body: q.body });
      if (draft?.body?.trim()) {
        await this.prisma.qna_post.update({ where: { id: postId }, data: { ai_draft: draft.body.trim(), ai_draft_at: new Date() } });
      }
    } catch (e) {
      this.logger.warn(`AI 초안 생성 실패(무해): ${(e as Error).message}`);
    }
  }
}
