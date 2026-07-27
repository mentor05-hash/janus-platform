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
import {
  detectDirectContact,
  DIRECT_CONTACT_WARNING,
} from '../../common/moderation/direct-contact';
import { kstDateString } from '../../common/time/kst';
import {
  AccountRole,
  ConsultMode,
  ConsultType,
  TeacherGrade,
} from '../../config/enums';
import { AvailabilityService } from '../availability/availability.service';
import { BookingService } from '../booking/booking.service';
import { CreditService } from '../billing/credit.service';
import { ConfigService } from '@nestjs/config';
import { PricingService } from '../pricing-policy/pricing.service';
import { AdminPolicyService } from '../pricing-policy/admin-policy.service';
import {
  benefitOf,
  compareQnaQueue,
} from '../pricing-policy/domain/grade-benefits';
import { envInt } from '../../common/quota/usage-quota';
import {
  SubjectQuota,
  SubjectQuotaExceededError,
} from '../../common/quota/subject-quota';

/**
 * 유사도 비교에 넣을 이전 답변 수. 프롬프트 길이 = 호출당 단가라 상한이 필요하다.
 * 기존 100건은 답변 본문 100개를 한 프롬프트에 실어 비용 추정을 크게 벗어났다.
 */
const SIMILARITY_PRIOR_LIMIT = 20;
/** 교사 1인 일 유사도 검사 기본 상한. 넘으면 검사 없이 등록된다(등록을 막지 않는다). */
const DEFAULT_SIMILARITY_PER_USER_DAY = 40;
import { canAnswerQuestion, QnaScope } from './domain/qna';
import { computeSla } from './domain/qna-sla';
import { pickAssignee } from './domain/qna-assign';
import {
  COMMUNITY_DAILY_LIMIT,
  aiUnlabeled,
  canAnswerCommunity,
  shouldHide,
  withinDailyLimit,
} from './domain/qna-community';
import {
  DEFAULT_LEAGUE_POLICY,
  TIER_LABEL,
  evaluateLeague,
  nextTierNeed,
  type LeaguePolicy,
} from './domain/qna-league';
import { aggregateSubjectStats } from './domain/qna-subject-stat';
import { credentialBadge } from './domain/qna-answerer-credential';
import {
  aggregateAxisStats,
  isPentagonVisible,
  isValidAxis,
  isValidScore,
} from './domain/qna-answer-rating';
import { NotifyService } from '../notification/notify.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { FilesService } from '../storage/files.service';
import { SchoolRecordGuardService } from '../guard/school-record-guard.service';
import { CreateAnswerDto, CreateQuestionDto } from './dto/qna.dto';
import { Inject } from '@nestjs/common';
import { LLM_PROVIDER } from '../llm/llm.types';
import type { LlmProvider, AnswerSimilarityResult } from '../llm/llm.types';

// 강제배정 상태기계 임계값(§1-2 배정 루프). 운영 중 필요 시 정책값으로 승격.
const CLAIM_TTL_MIN = 30; // 클레임 후 이 시간까지 첫 응답 없으면 재개방
const OPEN_AGE_MIN = 15; // 공개(미배정) 질문이 이 시간 지나면 강제배정
const SWEEP_LIMIT = 50; // 1회 스윕당 강제배정 상한
const REANSWER_LIMIT = 3; // 재답변 요청 한도(qa.reanswerLimit — 정책값화는 후속)
const ESCALATE_HORIZON_DAYS = 7; // 상담 승격 시 빈 슬롯 탐색 범위
const ESCALATE_SLOT_MIN = 10; // 슬롯 단위(분)

interface QnaRow {
  id: string;
  subject: string | null;
  difficulty: string | null;
  scope: string | null;
  q_type?: string | null; // 요금 티어(general|item) — 0104
  body: string | null;
  status: string | null;
  created_at: Date;
  assigned_teacher_id?: string | null;
  attachments?: unknown;
  rating?: number | null;
  continue_pref?: boolean | null;
  ai_draft?: string | null;
  ai_draft_at?: Date | null;
  claimed_at?: Date | null;
  first_reply_at?: Date | null; // 진행 상태 표시(선생님 확인 중 등)
  qna_answer?: {
    id: string;
    body: string | null;
    accepted: boolean | null;
    created_at: Date;
    teacher_id?: string | null;
    teacher_profile?: { account?: { name?: string } };
  }[];
}

/**
 * 온라인 Q&A (CLAUDE.md §6 Phase 3). 질문 건당 과금(§5-2), 공개질문 수임 게이트(§5-9),
 * 채택 시 pay_eligible 표시 — **급여와 무관**(O113 으로 Q&A 채택 보상 폐지). 채택 이력·품질 지표용.
 */
@Injectable()
export class QnaService {
  private readonly logger = new Logger('Qna');

  private readonly subject: SubjectQuota;
  /** 교사 1인 일 유사도 검사 횟수(B221 1층). ENV 우선. */
  private readonly simPerUserDay: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly credit: CreditService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
    private readonly booking: BookingService,
    private readonly availability: AvailabilityService,
    private readonly notify: NotifyService,
    private readonly files: FilesService,
    private readonly guard: SchoolRecordGuardService,
    private readonly policy: AdminPolicyService,
    config: ConfigService,
    @Optional() private readonly realtime?: RealtimeGateway,
  ) {
    this.subject = new SubjectQuota(this.cache, 'llm');
    this.simPerUserDay = envInt(
      config.get<string>('LLM_SIMILARITY_PER_USER_DAY'),
      DEFAULT_SIMILARITY_PER_USER_DAY,
    );
  }

  /** 질문 요금 안내(학생) — 문항형/일반형 건당 크레딧 + 주간 무료 질문권 잔여. 센터별 정책 반영. */
  async pricingInfo(centerId: string | null, studentId?: string) {
    const [item, general] = await Promise.all([
      this.pricing.quoteBoard('item', centerId),
      this.pricing.quoteBoard('general', centerId),
    ]);
    const free = studentId ? await this.freeQuotaStatus(studentId) : null;
    // C3 응답 예상 시간 — 최근 30일 전체 풀 평균 첫응답(분). 데이터 없으면 null(표시 생략).
    const rows = await this.prisma.$queryRaw<Array<{ avg_min: number | null }>>`
      SELECT avg(EXTRACT(EPOCH FROM (first_reply_at - COALESCE(escalated_at, created_at))) / 60) AS avg_min
      FROM qna_post WHERE first_reply_at IS NOT NULL AND created_at > now() - interval '30 days'`;
    const expectedFirstReplyMin =
      rows[0]?.avg_min != null
        ? Math.max(1, Math.round(Number(rows[0].avg_min)))
        : null;
    const ticketRemaining = studentId
      ? await this.ticketRemaining(studentId)
      : null;
    return {
      itemFee: item.credits,
      generalFee: general.credits,
      freeQuota: free,
      ticketRemaining,
      expectedFirstReplyMin,
    };
  }

  /** C1 직거래·연락처 감지 기록(audit_log 재사용) — 실패 비차단. 반환: 경고 문구 또는 null. */
  private async moderate(
    actor: AuthUser,
    context: string,
    refId: string,
    text: string | null | undefined,
  ): Promise<string | null> {
    const kinds = detectDirectContact(text);
    if (kinds.length === 0) return null;
    try {
      await this.prisma.audit_log.create({
        data: {
          actor_id: actor.id,
          actor_role: actor.role,
          action: 'moderation_flag',
          target_type: context,
          target_id: refId,
          summary: (text ?? '').slice(0, 120),
          meta: { kinds } as object,
          center_id: actor.centerId ?? null,
        },
      });
    } catch {
      /* 기록 실패는 삼킨다 */
    }
    return DIRECT_CONTACT_WARNING;
  }

  // ── P1(큐브 벤치마크): 주간 무료 질문권 — 구독 등급 번들. 수치는 system_setting(관리자 조정) ──
  private static readonly FREE_QUOTA_KEY = 'qa_free_quota';
  private static readonly FREE_QUOTA_DEFAULT = {
    premiumWeekly: 3,
    defaultWeekly: 0,
  }; // N23~25 확정 시 조정

  /** 이번 주(KST 월요일 00:00) 시작 시각. */
  private weekStartKst(): Date {
    const kst = new Date(Date.now() + 9 * 3600_000);
    const day = (kst.getUTCDay() + 6) % 7; // 월=0
    const monday = Date.UTC(
      kst.getUTCFullYear(),
      kst.getUTCMonth(),
      kst.getUTCDate() - day,
    );
    return new Date(monday - 9 * 3600_000);
  }

  /** 주간 무료 질문권 상태 — 프리미엄 등급(tier≥3·이름 폴백, realtime 게이팅과 동일 규칙) 기준. */
  async freeQuotaStatus(studentId: string): Promise<{
    quota: number;
    used: number;
    remaining: number;
    resetsAt: string;
  }> {
    const row = await this.prisma.system_setting.findUnique({
      where: { key: QnaService.FREE_QUOTA_KEY },
    });
    const cfg = {
      ...QnaService.FREE_QUOTA_DEFAULT,
      ...((row?.value as object) ?? {}),
    } as { premiumWeekly: number; defaultWeekly: number };
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: studentId },
      select: { membership_grade: { select: { name: true, tier: true } } },
    });
    const g = sp?.membership_grade;
    const premium =
      (g?.tier ?? 0) >= 3 || /premium|프리미엄/i.test(g?.name ?? '');
    const quota = Math.max(0, premium ? cfg.premiumWeekly : cfg.defaultWeekly);
    const weekStart = this.weekStartKst();
    const used =
      quota > 0
        ? await this.prisma.qna_post.count({
            where: {
              student_id: studentId,
              free_used: true,
              created_at: { gte: weekStart },
            },
          })
        : 0;
    const resetsAt = new Date(
      weekStart.getTime() + 7 * 24 * 3600_000,
    ).toISOString();
    return { quota, used, remaining: Math.max(0, quota - used), resetsAt };
  }

  // ── B1 질문권 묶음 상품 — 크레딧 선구매·FIFO 소진. 구성은 system_setting(관리자 조정) ──
  private static readonly TICKET_BUNDLE_KEY = 'qa_ticket_bundles';
  private static readonly TICKET_BUNDLE_DEFAULT = [
    { count: 5, discountPct: 10 },
    { count: 10, discountPct: 20 },
  ];

  /** 판매 중인 묶음 구성(정책) — 단가는 general 시세 기준 할인 적용. */
  private async ticketBundleProducts(centerId: string | null) {
    const row = await this.prisma.system_setting.findUnique({
      where: { key: QnaService.TICKET_BUNDLE_KEY },
    });
    const cfg = (
      Array.isArray(row?.value) ? row.value : QnaService.TICKET_BUNDLE_DEFAULT
    ) as Array<{ count: number; discountPct: number }>;
    const quote = await this.pricing.quoteBoard('general', centerId);
    return cfg
      .filter((b) => b.count > 0)
      .map((b) => {
        const price = Math.round(
          (quote.credits * b.count * (100 - b.discountPct)) / 100,
        );
        return {
          count: b.count,
          discountPct: b.discountPct,
          price,
          unitPrice: Math.round(price / b.count),
          listPrice: quote.credits * b.count,
        };
      });
  }

  /** 보유 질문권 잔여(미만료 묶음 합). */
  async ticketRemaining(studentId: string): Promise<number> {
    const agg = await this.prisma.qna_ticket_bundle.aggregate({
      _sum: { remaining: true },
      where: {
        student_id: studentId,
        remaining: { gt: 0 },
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
      },
    });
    return agg._sum.remaining ?? 0;
  }

  /** 질문권 현황 + 판매 상품(학생). */
  async ticketInfo(student: AuthUser) {
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: student.id },
    });
    if (!sp) throw new NotFoundException('학생 프로필이 없습니다.');
    const [remaining, products] = await Promise.all([
      this.ticketRemaining(student.id),
      this.ticketBundleProducts(sp.center_id),
    ]);
    return { remaining, products };
  }

  /** 묶음 구매 — 크레딧 차감과 묶음 생성을 원자 처리. 부족 시 결제요청+402. */
  async purchaseTickets(student: AuthUser, count: number) {
    if (student.role !== AccountRole.STUDENT)
      throw new ForbiddenException('학생만 구매할 수 있습니다.');
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: student.id },
    });
    if (!sp) throw new NotFoundException('학생 프로필이 없습니다.');
    const products = await this.ticketBundleProducts(sp.center_id);
    const item = products.find((p) => p.count === count);
    if (!item) throw new BadRequestException('판매 중인 묶음이 아닙니다.');
    try {
      const bundle = await this.prisma.$transaction(async (tx) => {
        const outcome = await this.credit.consumeWithin(
          tx,
          student.id,
          item.price,
          {
            refType: 'qna_ticket',
            description: `Q&A 질문권 ${item.count}회 묶음 구매`,
          },
        );
        if (!outcome.ok) throw new ShortfallError(outcome.shortfall);
        return tx.qna_ticket_bundle.create({
          data: {
            student_id: student.id,
            count: item.count,
            remaining: item.count,
            credits_paid: item.price,
            unit_credits: item.unitPrice,
          },
        });
      });
      const remaining = await this.ticketRemaining(student.id);
      return {
        ok: true,
        bundleId: bundle.id,
        count: item.count,
        paid: item.price,
        ticketRemaining: remaining,
      };
    } catch (e) {
      if (e instanceof ShortfallError) {
        await this.credit.createPaymentRequest(student.id, e.shortfall, {
          refType: 'qna_ticket',
        });
        throw new HttpException(
          `크레딧이 ${e.shortfall} 부족합니다. 결제요청이 생성되었습니다.`,
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      throw e;
    }
  }

  /** 트랜잭션 내 질문권 1건 소진(FIFO — 만료 임박·오래된 묶음 먼저). 성공 시 true. */
  private async consumeTicketWithin(
    tx: Prisma.TransactionClient,
    studentId: string,
  ): Promise<boolean> {
    const bundles = await tx.qna_ticket_bundle.findMany({
      where: {
        student_id: studentId,
        remaining: { gt: 0 },
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
      },
      orderBy: { created_at: 'asc' },
    });
    for (const b of bundles) {
      const upd = await tx.qna_ticket_bundle.updateMany({
        where: { id: b.id, remaining: { gt: 0 } },
        data: { remaining: { decrement: 1 } },
      });
      if (upd.count === 1) return true;
    }
    return false;
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

    // P2(AI 즉답 1층): 등록은 무료 — AI 초안이 먼저 제공되고, 과금·선생님 노출은
    // 학생이 [선생님 답변 받기](escalate) 를 눌렀을 때 일어난다(자연 과금 퍼널 §1-4 동형).
    const post = await this.prisma.qna_post.create({
      data: {
        student_id: student.id,
        subject: dto.subject ?? null,
        difficulty: dto.difficulty ?? null,
        scope: dto.scope,
        assigned_teacher_id:
          dto.scope === 'assigned' ? dto.assignedTeacherId! : null,
        body: dto.body,
        // 요금 티어는 **등록 시점에 확정해 저장**한다 — escalate 는 나중이고, 그때 다시 물으면
        // 학생이 등록 화면에서 본 금액과 달라질 수 있다(표시=과금 원칙).
        q_type: dto.qType ?? 'general',
        status: 'ai_pending',
        free_used: false,
        attachments: (dto.attachments ??
          []) as unknown as Prisma.InputJsonValue,
      },
    });
    // Q3: 질문 등록 즉시 AI 1차 초안 자동 생성(비동기·비용상한·실패 무해).
    void this.generateAiDraft(post.id, {
      subject: dto.subject ?? null,
      difficulty: dto.difficulty ?? null,
      body: dto.body,
    });
    const moderationWarning = await this.moderate(
      student,
      'qna_post',
      post.id,
      dto.body,
    );
    const freeQ = await this.freeQuotaStatus(student.id);
    return {
      id: post.id,
      scope: post.scope,
      status: post.status,
      chargedCredits: 0,
      /** 확정된 요금 티어와 그 티어의 예상 과금액 — 등록은 무료이고 escalate 에서 이 금액이 청구된다. */
      qType: post.q_type,
      escalateCredits: (
        await this.pricing.quoteBoard(
          post.q_type === 'item' ? 'item' : 'general',
          sp.center_id,
        )
      ).credits,
      freeUsed: false,
      freeRemaining: freeQ.remaining,
      moderationWarning,
    };
  }

  /** P2 — [선생님 답변 받기]: 이 시점에 무료질문권/크레딧을 소진하고 선생님에게 노출(open). */
  async escalateToHuman(student: AuthUser, postId: string) {
    const post = await this.prisma.qna_post.findUnique({
      where: { id: postId },
    });
    if (!post || post.student_id !== student.id)
      throw new NotFoundException('질문을 찾을 수 없습니다.');
    if (post.status !== 'ai_pending')
      throw new BadRequestException(
        '이미 선생님 답변이 진행 중이거나 종료된 질문입니다.',
      );
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: student.id },
    });
    if (!sp) throw new NotFoundException('학생 프로필이 없습니다.');
    // 등록 시 저장된 유형으로 견적한다. 이전엔 'general' 이 하드코딩돼 있어, 학생이 문항형(8,000)을
    // 보고 등록해도 4,000 만 과금됐다 — 표시와 과금이 어긋나고 board_item_fee 티어가 도달 불가였다.
    const quote = await this.pricing.quoteBoard(
      post.q_type === 'item' ? 'item' : 'general',
      sp.center_id,
    );
    // 소진 순서(B1): 주간 무료 질문권 → 묶음 질문권 → 크레딧 과금.
    const freeQ = await this.freeQuotaStatus(student.id);
    const useFree = freeQ.remaining > 0;
    let usedTicket = false;
    let credits = 0;
    try {
      await this.prisma.$transaction(async (tx) => {
        const upd = await tx.qna_post.updateMany({
          where: { id: postId, status: 'ai_pending' },
          data: {
            status: 'open',
            free_used: useFree,
            escalated_at: new Date(),
          },
        });
        if (upd.count !== 1)
          throw new BadRequestException('이미 처리된 질문입니다.');
        if (!useFree) {
          usedTicket = await this.consumeTicketWithin(tx, student.id);
          if (!usedTicket) {
            credits = quote.credits;
            const outcome = await this.credit.consumeWithin(
              tx,
              student.id,
              credits,
              {
                refType: 'qna',
                refId: postId,
                description: 'Q&A 선생님 답변 요청',
              },
            );
            if (!outcome.ok) throw new ShortfallError(outcome.shortfall);
          }
        }
      });
      // 지정 질문이면 이 시점에 선생님에게 알림(그 전에는 선생님에게 보이지 않음).
      if (post.scope === 'assigned' && post.assigned_teacher_id) {
        void this.notify?.notify(post.assigned_teacher_id, 'qna_assigned', {
          postId,
        });
      } else {
        // 공개 질문 — 접속 중 선생님 전원에게 실시간 신호(큐·배지 즉시 갱신, DB 알림 없음).
        void this.notify?.broadcastTeachers(
          'qna_pool_new',
          '새 공개질문',
          `[${post.subject ?? '질문'}] 공개질문 큐에 새 질문이 도착했어요.`,
          { postId },
        );
      }
      const ticketRemaining = usedTicket
        ? await this.ticketRemaining(student.id)
        : undefined;
      return {
        ok: true,
        status: 'open',
        chargedCredits: credits,
        freeUsed: useFree,
        usedTicket,
        ticketRemaining,
        freeRemaining: useFree ? freeQ.remaining - 1 : freeQ.remaining,
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

  // ── P3 유사 질문 재사용 — 아카이브의 자산화(문자 bigram Jaccard — 한국어 안전) ──
  private static bigrams(s: string): Set<string> {
    const t = s
      .replace(/\s+/g, ' ')
      .replace(/[^\p{L}\p{N} ]/gu, '')
      .trim();
    const out = new Set<string>();
    for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
    return out;
  }
  private static jaccard(a: Set<string>, b: Set<string>): number {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    return inter / (a.size + b.size - inter);
  }

  /** P3 — 작성 중 질문과 유사한 "해결된" 질문 상위 3건(무료 열람 제안용). */
  async findSimilar(
    user: AuthUser,
    dto: { subject?: string | null; body: string },
  ) {
    if (!dto.body || dto.body.trim().length < 10) return { items: [] };
    const cands = await this.prisma.qna_post.findMany({
      where: {
        status: 'resolved',
        hidden: false,
        community: false,
        ...(dto.subject ? { subject: dto.subject } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: 300,
      select: { id: true, subject: true, body: true, created_at: true },
    });
    const q = QnaService.bigrams(dto.body);
    const scored = cands
      .map((c) => ({
        c,
        score: QnaService.jaccard(q, QnaService.bigrams(c.body ?? '')),
      }))
      .filter((x) => x.score >= 0.18)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    if (!scored.length) return { items: [] };
    const answers = await this.prisma.qna_answer.findMany({
      where: { post_id: { in: scored.map((x) => x.c.id) }, accepted: true },
      select: { post_id: true, body: true },
    });
    const amap = new Map(answers.map((a) => [a.post_id, a.body ?? '']));
    return {
      items: scored.map(({ c, score }) => ({
        id: c.id,
        subject: c.subject,
        similarity: Math.round(score * 100) / 100,
        bodyPreview: (c.body ?? '').slice(0, 90),
        answerPreview: (amap.get(c.id) ?? '').slice(0, 120),
      })),
    };
  }

  /** P3 — 유사 질문 익명 열람(해결 건만·첨부 제외·질문자 비노출). 로그인 학생 무료. */
  async similarDetail(user: AuthUser, postId: string) {
    const post = await this.prisma.qna_post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        subject: true,
        body: true,
        status: true,
        hidden: true,
        community: true,
        created_at: true,
      },
    });
    if (!post || post.status !== 'resolved' || post.hidden)
      throw new NotFoundException('열람할 수 없는 질문입니다.');
    const answers = await this.prisma.qna_answer.findMany({
      where: { post_id: postId },
      orderBy: { created_at: 'asc' },
      include: {
        teacher_profile: { include: { account: { select: { name: true } } } },
      },
    });
    return {
      id: post.id,
      subject: post.subject,
      body: post.body ?? '',
      createdAt: post.created_at,
      answers: answers.map((a) => ({
        body: a.body ?? '',
        accepted: !!a.accepted,
        teacherName: a.teacher_profile?.account?.name ?? '선생님',
      })),
    };
  }

  /** P2 — [충분해요]: AI 답으로 해결 종료(과금 없음). */
  async resolveWithAi(student: AuthUser, postId: string) {
    const upd = await this.prisma.qna_post.updateMany({
      where: { id: postId, student_id: student.id, status: 'ai_pending' },
      data: { status: 'resolved', resolved_at: new Date() },
    });
    if (upd.count !== 1)
      throw new BadRequestException(
        'AI 즉답 대기 상태의 질문만 해결로 표시할 수 있습니다.',
      );
    return { ok: true, status: 'resolved' };
  }

  /** 목록: 학생=본인 질문, 교사=공개(open)+나에게 지정된 것, 관리자=전체. 답변 포함. */
  async listPosts(user: AuthUser) {
    const answersInclude = {
      qna_answer: {
        orderBy: { created_at: 'asc' as const },
        include: {
          teacher_profile: { include: { account: { select: { name: true } } } },
          qna_followup: { orderBy: { created_at: 'asc' as const } },
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
        /** 요금 티어 — 클라이언트가 [선생님 답변 받기] 확인 문구에 **이 질문의** 금액을 쓰게 한다. */
        qType: p.q_type ?? 'general',
        assignedTeacherId: p.assigned_teacher_id ?? null,
        body: p.body ?? '',
        status: p.status ?? 'open',
        created_at: p.created_at,
        rating: p.rating ?? null,
        continuePref: p.continue_pref ?? null,
        aiDraft: p.ai_draft ?? null,
        aiDraftAt: p.ai_draft_at ?? null,
        claimedAt: p.claimed_at ?? null,
        firstReplyAt: p.first_reply_at ?? null,
        attachments: Array.isArray(p.attachments)
          ? (p.attachments as { id: string; name: string; type?: string }[])
          : [],
        answers: (p.qna_answer ?? []).map((a) => ({
          id: a.id,
          body: a.body ?? '',
          accepted: !!a.accepted,
          teacherId: a.teacher_id ?? null,
          teacherName: a.teacher_profile?.account?.name ?? '선생님',
          escalationOk:
            (a.teacher_profile as { qna_escalation?: boolean } | undefined)
              ?.qna_escalation !== false,
          createdAt: a.created_at,
          attachments: Array.isArray(
            (a as { attachments?: unknown }).attachments,
          )
            ? ((a as { attachments?: unknown }).attachments as {
                id: string;
                name: string;
                type?: string;
              }[])
            : [],
          followups: (
            (
              a as {
                qna_followup?: Array<{
                  id: string;
                  author_id: string;
                  body: string;
                  created_at: Date;
                }>;
              }
            ).qna_followup ?? []
          ).map((fu) => ({
            id: fu.id,
            byTeacher: fu.author_id === a.teacher_id,
            body: fu.body,
            createdAt: fu.created_at,
          })),
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
      // Q1: 나를 소프트 블록한 학생의 질문은 화면·배정 큐에서 제외(사유 비노출).
      const blocks = await this.prisma.qna_relation_block.findMany({
        where: { teacher_id: user.id },
        select: { student_id: true },
      });
      const blockedStudents = blocks.map((b) => b.student_id);
      // 답변 큐는 **경합 지점**이다 — 선생님이 목록 위에서부터 집어가므로 순서가 곧 응답 속도다.
      // 상위 등급 질문에 가중치를 주되(B218), 48h 초과 미답은 등급을 무시하고 앞으로 끌어올린다
      // (기아 방지 + 급여 T5c 48h 보상과 정합). 총 답변량을 늘리지 않으므로 원가는 0.
      const benefits = await this.policy.getGradeBenefits();
      const rows = await this.prisma.qna_post.findMany({
        where: {
          AND: [
            // P2: ai_pending(AI 1층 대기)은 선생님에게 노출하지 않는다 — escalate 후에만.
            {
              OR: [
                { scope: 'open', status: 'open' },
                { assigned_teacher_id: user.id, status: { not: 'ai_pending' } },
              ],
            },
            ...(blockedStudents.length
              ? [{ student_id: { notIn: blockedStudents } }]
              : []),
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
  /** 선생님 Q&A 대기 배지 — 공개 큐 미클레임 + 내가 맡은 미답변(사이드바 배지·소음 없는 카운트만). */
  async qnaAttention(teacher: AuthUser) {
    if (teacher.role !== AccountRole.TEACHER)
      throw new ForbiddenException('선생님 전용입니다.');
    const [pool, mine] = await Promise.all([
      this.prisma.qna_post.count({
        where: {
          status: 'open',
          scope: 'open',
          assigned_teacher_id: null,
          community: false,
          hidden: false,
        },
      }),
      this.prisma.qna_post.count({
        where: {
          status: 'open',
          assigned_teacher_id: teacher.id,
          first_reply_at: null,
          hidden: false,
        },
      }),
    ]);
    return { pool, mine, total: pool + mine };
  }

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
    // F3: 수신을 꺼 둔 선생님은 가져갈 수 없음(설정 화면 안내와 정합).
    const myTp = await this.prisma.teacher_profile.findUnique({
      where: { account_id: teacher.id },
      select: { qna_receive: true },
    });
    if (myTp?.qna_receive === false)
      throw new ForbiddenException(
        'Q&A 수신을 꺼 두었습니다 — 내 프로필에서 다시 켤 수 있어요.',
      );
    // Q1 소프트 블록: 학생이 이 선생님을 차단했으면 가져갈 수 없음(사유 비노출).
    const blocked = await this.prisma.qna_relation_block.findUnique({
      where: {
        student_id_teacher_id: {
          student_id: post.student_id,
          teacher_id: teacher.id,
        },
      },
    });
    if (blocked) throw new NotFoundException('질문을 찾을 수 없습니다.');
    // 재답변 요청된 질문: 이전 답변자는 다시 가져갈 수 없음(제외 후 재공개).
    if (post.reanswer_count > 0) {
      const answered = await this.prisma.qna_answer.findFirst({
        where: { post_id: postId, teacher_id: teacher.id },
        select: { id: true },
      });
      if (answered)
        throw new ForbiddenException(
          '재답변 요청된 질문입니다 — 이전 답변자는 다시 답할 수 없습니다.',
        );
    }
    // 선착순: scope=open·미배정일 때만 1건 전환. 경쟁 시 count!==1 → 409. claimed_at 기록(SLA).
    const upd = await this.prisma.qna_post.updateMany({
      where: {
        id: postId,
        scope: 'open',
        status: 'open',
        assigned_teacher_id: null,
      },
      data: {
        scope: 'assigned',
        assigned_teacher_id: teacher.id,
        claimed_at: new Date(),
      },
    });
    if (upd.count !== 1) {
      throw new ConflictException('다른 선생님이 먼저 가져갔습니다.');
    }
    // 학생에게 진행 상태 알림 — "선생님 확인 중" 배지 실시간 갱신용.
    void this.notify.notify(post.student_id, 'qna_claimed', { postId });
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
      const already = await this.prisma.qna_answer.findFirst({
        where: { post_id: postId, teacher_id: teacher.id },
        select: { id: true },
      });
      if (already)
        throw new ForbiddenException(
          '재답변 요청된 질문입니다 — 이전 답변자는 다시 답할 수 없습니다.',
        );
    }
    // AI 1차 답변 유사도(표절·중복) — **best-effort**. 검사 실패가 답변 등록을 막지 않는다.
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
        attachments: (dto.attachments ??
          []) as unknown as Prisma.InputJsonValue, // P4 화이트보드 풀이 등
        accepted: false,
        pay_eligible: false,
        // `similarity = NULL` 이 곧 **미검사** 표식이다(검사되면 0 이라도 값이 들어간다).
        // sim_flagged 는 non-null 이라 미검사 시 false — 단독으로는 구분되지 않는다.
        similarity: sim?.maxSimilarity ?? null,
        similar_to_id: sim?.similarToId ?? null,
        sim_flagged: sim?.flagged ?? false,
      },
    });
    // Q1 SLA: 최초 응답 시각(1회만).
    if (post.first_reply_at == null) {
      await this.prisma.qna_post.update({
        where: { id: postId },
        data: { first_reply_at: new Date() },
      });
    }
    const moderationWarning = await this.moderate(
      teacher,
      'qna_answer',
      ans.id,
      dto.body,
    );
    // 학생에게 답변 도착 알림 — 목록 실시간 갱신("답변옴")·토스트.
    void this.notify.notify(post.student_id, 'qna_answered', { postId });
    return {
      id: ans.id,
      postId,
      accepted: false,
      // 검사를 못 붙였으면 미검사 상태로 정직하게 내려보낸다 — 화면이 "이상 없음"으로 오해하면
      // 표절 검사가 돌지 않은 것을 아무도 눈치채지 못한다.
      simChecked: sim !== null,
      simFlagged: sim?.flagged ?? null,
      similarity: sim?.maxSimilarity ?? null,
      simSummary: sim?.summary ?? null,
      moderationWarning,
    };
  }

  /**
   * 답변 유사도 검사 — **검사 실패가 답변 등록을 막지 않는다**(B221·B223).
   *
   * 이전 구현은 `checkAnswerSimilarity()` 를 먼저 호출하고 그 결과로 row 를 만들었다.
   * 그래서 LLM 장애나 비용 상한 도달이 곧 **답변 등록 전면 중단**이었다 —
   * 학생은 답을 못 받고 선생님은 급여 적격 건(`pay_eligible`)을 만들 수 없다.
   * 부수 기능(표절 검사)이 핵심 기능(답변)을 끄는 순서라 뒤집었다.
   *
   * 또 교사 1인이 답변마다 트리거하므로 사용자별 일 한도를 걸어
   * 한 명이 `similarity` 용도 상한을 혼자 태우지 못하게 한다.
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
    // 비교 대상이 많을수록 프롬프트가 길어져 호출당 단가가 오른다 — 20건으로 제한.
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

  // ── C2(큐브 벤치마크): 답변 후속 문답 — 같은 선생님에게 이어 묻기(추가 과금 없음) ──
  private static readonly FOLLOWUP_LIMIT_KEY = 'qa_followup_limit';
  private static readonly FOLLOWUP_LIMIT_DEFAULT = 2; // 답변당 학생 후속 질문 한도(정책값)

  /** 후속 문답 등록 — 학생(질문 작성자, 답변당 한도)·선생님(해당 답변 작성자, 무제한 응답). */
  async addFollowup(user: AuthUser, answerId: string, body: string) {
    const text = body?.trim();
    if (!text) throw new BadRequestException('내용을 입력하세요.');
    const ans = await this.prisma.qna_answer.findUnique({
      where: { id: answerId },
      include: { qna_post: true },
    });
    if (!ans) throw new NotFoundException('답변을 찾을 수 없습니다.');
    const isStudent = ans.qna_post.student_id === user.id;
    const isAnswerer = ans.teacher_id === user.id;
    if (!isStudent && !isAnswerer)
      throw new ForbiddenException(
        '이 답변의 당사자만 이어서 대화할 수 있습니다.',
      );
    if (isStudent) {
      const row = await this.prisma.system_setting.findUnique({
        where: { key: QnaService.FOLLOWUP_LIMIT_KEY },
      });
      const limit = Number(
        (row?.value as { limit?: number } | null)?.limit ??
          QnaService.FOLLOWUP_LIMIT_DEFAULT,
      );
      const used = await this.prisma.qna_followup.count({
        where: { answer_id: answerId, author_id: user.id },
      });
      if (used >= limit)
        throw new ForbiddenException(
          `이어 묻기는 답변당 ${limit}회까지예요. 더 필요하면 재답변 요청 또는 상담으로 이어가기를 이용해 주세요.`,
        );
    }
    const fu = await this.prisma.qna_followup.create({
      data: { answer_id: answerId, author_id: user.id, body: text },
    });
    const moderationWarning = await this.moderate(
      user,
      'qna_followup',
      fu.id,
      text,
    );
    // 상대에게 알림(실패 비차단)
    const to = isStudent ? ans.teacher_id : ans.qna_post.student_id;
    void this.notify.notify(to, 'qna_followup', {
      postId: ans.post_id,
      byTeacher: !isStudent,
    });
    return { id: fu.id, createdAt: fu.created_at, moderationWarning };
  }

  /** 답변 채택(질문 학생) — pay_eligible 표시(급여 미반영, O113), 질문 마감. */
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
  /** F2 찜 토글 — teacher_list_entry(list_kind='fit') 재사용. 찜 해제는 fit 만 삭제. */
  async setFavorite(student: AuthUser, teacherId: string, favored: boolean) {
    if (student.role !== AccountRole.STUDENT)
      throw new ForbiddenException('학생만 설정할 수 있습니다.');
    if (favored) {
      await this.prisma.teacher_list_entry.upsert({
        where: {
          student_id_teacher_id: {
            student_id: student.id,
            teacher_id: teacherId,
          },
        },
        create: {
          student_id: student.id,
          teacher_id: teacherId,
          list_kind: 'fit',
        },
        update: { list_kind: 'fit' },
      });
    } else {
      await this.prisma.teacher_list_entry.deleteMany({
        where: {
          student_id: student.id,
          teacher_id: teacherId,
          list_kind: 'fit',
        },
      });
    }
    return { ok: true, favored };
  }

  async feedback(
    student: AuthUser,
    postId: string,
    dto: { rating?: number; continuePref?: boolean },
  ) {
    const post = await this.prisma.qna_post.findUnique({
      where: { id: postId },
      include: {
        qna_answer: {
          where: { accepted: true },
          take: 1,
          select: { teacher_id: true },
        },
      },
    });
    if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');
    if (post.student_id !== student.id)
      throw new ForbiddenException('본인 질문만 평가할 수 있습니다.');
    if (post.status !== 'resolved')
      throw new BadRequestException('해결된 질문만 평가할 수 있습니다.');
    const rating =
      dto.rating != null
        ? Math.min(5, Math.max(1, Math.round(dto.rating)))
        : null;
    await this.prisma.qna_post.update({
      where: { id: postId },
      data: { rating, continue_pref: dto.continuePref ?? null },
    });
    let blockedTeacher = false;
    const teacherId = post.qna_answer[0]?.teacher_id;
    // F2: "계속 받을게요" = 자동 찜(리스트 상단 고정) — 사후 개인화 루프.
    if (dto.continuePref === true && teacherId) {
      await this.setFavorite(student, teacherId, true).catch(() => {
        /* 찜 실패 비차단 */
      });
    }
    if (dto.continuePref === false && teacherId) {
      await this.prisma.qna_relation_block.upsert({
        where: {
          student_id_teacher_id: {
            student_id: student.id,
            teacher_id: teacherId,
          },
        },
        create: { student_id: student.id, teacher_id: teacherId },
        update: {},
      });
      blockedTeacher = true;
    }
    return {
      postId,
      rating,
      continuePref: dto.continuePref ?? null,
      blockedTeacher,
    };
  }

  /** 소프트 블록 설정/해제(학생) — 선생님에게 비공지. */
  async setBlock(student: AuthUser, teacherId: string, blocked: boolean) {
    if (student.role !== AccountRole.STUDENT)
      throw new ForbiddenException('학생만 설정할 수 있습니다.');
    if (blocked) {
      await this.prisma.qna_relation_block.upsert({
        where: {
          student_id_teacher_id: {
            student_id: student.id,
            teacher_id: teacherId,
          },
        },
        create: { student_id: student.id, teacher_id: teacherId },
        update: {},
      });
    } else {
      await this.prisma.qna_relation_block.deleteMany({
        where: { student_id: student.id, teacher_id: teacherId },
      });
    }
    return { teacherId, blocked };
  }

  /** 내 소프트 블록 목록(학생) — 해제 UI 용. */
  async myBlocks(student: AuthUser) {
    if (student.role !== AccountRole.STUDENT)
      throw new ForbiddenException('학생만 조회할 수 있습니다.');
    const blocks = await this.prisma.qna_relation_block.findMany({
      where: { student_id: student.id },
      orderBy: { created_at: 'desc' },
    });
    if (!blocks.length)
      return {
        blocks: [] as Array<{
          teacherId: string;
          teacherName: string;
          since: Date;
        }>,
      };
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: blocks.map((b) => b.teacher_id) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(accounts.map((a) => [a.id, a.name]));
    return {
      blocks: blocks.map((b) => ({
        teacherId: b.teacher_id,
        teacherName: nameOf.get(b.teacher_id) ?? '선생님',
        since: b.created_at,
      })),
    };
  }

  /** P5(큐브 벤치마크): 지정 질문용 선생님 디렉터리 — 공개 SLA 배지(평균 첫응답·만족도·답변 실적) 포함.
   *  학생의 소프트 블록 대상은 제외(§1-3 양방향 필터). */
  async teacherDirectory(student: AuthUser) {
    if (student.role !== AccountRole.STUDENT)
      throw new ForbiddenException('학생만 조회할 수 있습니다.');
    const blocked = await this.prisma.qna_relation_block.findMany({
      where: { student_id: student.id },
      select: { teacher_id: true },
    });
    const blockedSet = new Set(blocked.map((b) => b.teacher_id));
    const teachers = await this.prisma.teacher_profile.findMany({
      select: {
        account_id: true,
        qna_escalation: true,
        qna_receive: true,
        qna_subjects: true,
        subjects: true,
        account: { select: { name: true } },
      },
      take: 100,
    });
    // F2 찜(fit 리스트) — 상단 고정·필터용.
    const favs = await this.prisma.teacher_list_entry.findMany({
      where: { student_id: student.id, list_kind: 'fit' },
      select: { teacher_id: true },
    });
    const favSet = new Set(favs.map((f) => f.teacher_id));
    // 풀별 원칙(§2): 배지는 지정(assigned) 풀 기준 첫응답·만족도 + 전체 답변 실적(채택 수).
    const [slaRows, ansRows] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          tid: string;
          answered: number;
          avg_first_min: number | null;
          avg_rating: number | null;
        }>
      >`
        SELECT p.assigned_teacher_id AS tid,
               count(*) FILTER (WHERE p.first_reply_at IS NOT NULL)::int AS answered,
               avg(EXTRACT(EPOCH FROM (p.first_reply_at - COALESCE(p.escalated_at, p.created_at))) / 60) FILTER (WHERE p.first_reply_at IS NOT NULL) AS avg_first_min,
               avg(p.rating) FILTER (WHERE p.rating IS NOT NULL) AS avg_rating
        FROM qna_post p
        WHERE p.assigned_teacher_id IS NOT NULL
        GROUP BY 1`,
      this.prisma.$queryRaw<
        Array<{ tid: string; answers: number; accepted: number }>
      >`
        SELECT a.teacher_id AS tid, count(*)::int AS answers, count(*) FILTER (WHERE a.accepted)::int AS accepted
        FROM qna_answer a GROUP BY 1`,
    ]);
    const sla = new Map(slaRows.map((r) => [r.tid, r]));
    const ans = new Map(ansRows.map((r) => [r.tid, r]));
    return {
      teachers: teachers
        .filter((t) => !blockedSet.has(t.account_id))
        .filter((t) => t.qna_receive !== false) // F3 수신 꺼둔 선생님 제외
        .map((t) => {
          const s = sla.get(t.account_id);
          const a = ans.get(t.account_id);
          return {
            teacherId: t.account_id,
            name: t.account?.name ?? '선생님',
            avgFirstReplyMin:
              s?.avg_first_min != null
                ? Math.round(Number(s.avg_first_min))
                : null,
            avgRating:
              s?.avg_rating != null
                ? Math.round(Number(s.avg_rating) * 10) / 10
                : null,
            answers: a?.answers ?? 0,
            accepted: a?.accepted ?? 0,
            escalationOk: t.qna_escalation !== false, // "이어서 상담 가능" 선별 옵션용
            subjects:
              (t.qna_subjects?.length ? t.qna_subjects : t.subjects) ?? [], // F1 과목 일치(수신 제한 우선)
            favorite: favSet.has(t.account_id), // F2 찜
          };
        })
        // 실적 있는 선생님 우선(첫응답 빠른 순), 무실적은 뒤에 이름순
        .sort((x, y) => {
          if (x.avgFirstReplyMin == null && y.avgFirstReplyMin == null)
            return x.name.localeCompare(y.name);
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
      where: { student_id: student.id, status: { in: ['open', 'ai_pending'] } },
      orderBy: { created_at: 'desc' },
      take: 5,
      select: {
        id: true,
        subject: true,
        scope: true,
        created_at: true,
        first_reply_at: true,
        _count: { select: { qna_answer: true } },
      },
    });
    return {
      posts: rows.map((r) => ({
        id: r.id,
        subject: r.subject,
        scope: r.scope,
        createdAt: r.created_at,
        answered: r.first_reply_at != null,
        answerCount: r._count.qna_answer,
      })),
    };
  }

  /** Q1 SLA 풀별 집계(admin/hr) — 접수→클레임→첫응답→해결 지연·해결률. */
  async sla(user: AuthUser) {
    if (user.role !== AccountRole.ADMIN && user.role !== AccountRole.HR)
      throw new ForbiddenException('관리자만 조회할 수 있습니다.');
    const rows = await this.prisma.qna_post.findMany({
      select: {
        scope: true,
        created_at: true,
        claimed_at: true,
        first_reply_at: true,
        resolved_at: true,
      },
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
    await withCronLock(
      this.cache,
      'qna-sweep',
      300,
      async () => {
        const r = await this.sweep();
        if (r.released || r.assigned)
          this.logger.log(
            `Q&A 스윕: 재개방 ${r.released} · 강제배정 ${r.assigned}`,
          );
      },
      this.logger,
    );
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
      where: {
        scope: 'assigned',
        status: 'open',
        first_reply_at: null,
        claimed_at: { lt: cutoff },
      },
      data: { scope: 'open', assigned_teacher_id: null, claimed_at: null },
    });
    return res.count;
  }

  /** 미배정 공개질문(생성 후 maxAgeMin 경과) → 자격 있는 전임 중 최소 부하에게 강제배정(claimed_at 기록). */
  async autoAssignOpen(maxAgeMin: number, limit: number): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMin * 60_000);
    const opens = await this.prisma.qna_post.findMany({
      where: {
        scope: 'open',
        status: 'open',
        assigned_teacher_id: null,
        created_at: { lt: cutoff },
      },
      orderBy: { created_at: 'asc' },
      take: limit,
      select: { id: true, student_id: true },
    });
    let assigned = 0;
    for (const q of opens) {
      const teacherId = await this.pickForStudent(q.student_id);
      if (!teacherId) continue;
      const upd = await this.prisma.qna_post.updateMany({
        where: {
          id: q.id,
          scope: 'open',
          status: 'open',
          assigned_teacher_id: null,
        },
        data: {
          scope: 'assigned',
          assigned_teacher_id: teacherId,
          claimed_at: new Date(),
        },
      });
      if (upd.count === 1) assigned += 1;
    }
    return assigned;
  }

  /** 학생에게 배정 가능한 전임 선택 — 같은 센터·근무중, unfit·소프트블록 제외, 최소 부하. */
  private async pickForStudent(studentId: string): Promise<string | null> {
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: studentId },
      select: { center_id: true },
    });
    if (!sp?.center_id) return null;
    const teachers = await this.prisma.teacher_profile.findMany({
      where: { center_id: sp.center_id, work_status: 'on', qna_receive: true },
      select: { account_id: true },
    });
    const ids = teachers.map((t) => t.account_id);
    if (!ids.length) return null;
    const [unfit, blocks] = await Promise.all([
      this.prisma.teacher_list_entry.findMany({
        where: {
          student_id: studentId,
          teacher_id: { in: ids },
          list_kind: 'unfit',
        },
        select: { teacher_id: true },
      }),
      this.prisma.qna_relation_block.findMany({
        where: { student_id: studentId, teacher_id: { in: ids } },
        select: { teacher_id: true },
      }),
    ]);
    const excluded = new Set([
      ...unfit.map((u) => u.teacher_id),
      ...blocks.map((b) => b.teacher_id),
    ]);
    const eligible = ids.filter((id) => !excluded.has(id));
    if (!eligible.length) return null;
    const loads = await this.prisma.qna_post.groupBy({
      by: ['assigned_teacher_id'],
      where: {
        assigned_teacher_id: { in: eligible },
        scope: 'assigned',
        status: 'open',
        first_reply_at: null,
      },
      _count: { _all: true },
    });
    const loadMap = new Map(
      loads.map((l) => [l.assigned_teacher_id as string, l._count._all]),
    );
    return pickAssignee(
      eligible.map((id) => ({ teacherId: id, load: loadMap.get(id) ?? 0 })),
    );
  }

  // ── 불만족 후속 경로(§1-4, 감사 우선순위 3) ─────────────────────────────
  /** 재답변 요청(질문 학생) — 답변에 불만족 시 이전 답변자 제외하고 재공개. 한도 REANSWER_LIMIT. */
  async requestReanswer(student: AuthUser, postId: string, reason?: string) {
    const post = await this.prisma.qna_post.findUnique({
      where: { id: postId },
      include: { qna_answer: { select: { id: true }, take: 1 } },
    });
    if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');
    if (post.student_id !== student.id)
      throw new ForbiddenException('본인 질문만 재답변 요청할 수 있습니다.');
    if ((post.qna_answer?.length ?? 0) === 0)
      throw new BadRequestException(
        '아직 답변이 없어 재답변을 요청할 수 없습니다.',
      );
    if (post.status !== 'open')
      throw new BadRequestException(
        '진행 중인 질문만 재답변을 요청할 수 있습니다(채택 후에는 불가).',
      );
    if (post.reanswer_count >= REANSWER_LIMIT)
      throw new BadRequestException(
        `재답변은 최대 ${REANSWER_LIMIT}회까지 요청할 수 있습니다.`,
      );
    await this.prisma.qna_post.update({
      where: { id: postId },
      data: {
        reanswer_count: { increment: 1 },
        reanswer_reason: reason ?? null,
        scope: 'open',
        assigned_teacher_id: null,
        claimed_at: null,
        first_reply_at: null, // 재공개 + SLA 리셋
      },
    });
    const count = post.reanswer_count + 1;
    return { postId, reanswerCount: count, remaining: REANSWER_LIMIT - count };
  }

  /**
   * 상담 승격 첨부 이관 필터(지시서 §2·§6 스텝2) — 질문 첨부가 상담 세션으로 복제되는 경로에
   * 업로드와 "동일 필터"를 재적용한다. 저장 바이트를 다시 판정하여 생기부로 감지된 파일은
   * 이관 목록에서 제외한다. 읽기 실패(누락·일시오류)는 이관 유지(업로드 시 이미 가드 통과분).
   * @returns 통과한 첨부만. (감지 파일은 제외되어 상담 예약 payload 에 들어가지 않는다.)
   */
  private async filterEscalationAttachments(raw: unknown): Promise<unknown[]> {
    if (!Array.isArray(raw) || raw.length === 0) return [];
    if (!this.guard.enabled) return raw;
    const kept: unknown[] = [];
    for (const att of raw) {
      const id = (att as { id?: string })?.id;
      const name = (att as { name?: string })?.name;
      if (!id) continue; // 형식 불량 참조는 이관하지 않는다
      try {
        const { data, contentType, filename } = await this.files.readBytes(id);
        const verdict = await this.guard.inspect({
          buffer: Buffer.from(data),
          originalname: filename ?? name,
          mimetype: contentType,
        });
        if (verdict.blocked) {
          this.logger.warn(
            `상담 승격 첨부 제외(생기부 감지): reason=${verdict.reason} fileId=${id}`,
          );
          continue; // 감지 파일은 이관 목록에서 제외
        }
        kept.push(att);
      } catch {
        kept.push(att); // 읽기 실패는 이관 유지(업로드 시 가드 통과분)
      }
    }
    return kept;
  }

  /** 상담 승격(질문 학생) — 답변 선생님에게 질문·답변 컨텍스트를 담아 상담 예약 생성(가까운 빈 슬롯). */
  async escalate(
    student: AuthUser,
    postId: string,
    pick?: { dateStr: string; slotStart: number },
  ) {
    const post = await this.prisma.qna_post.findUnique({
      where: { id: postId },
      include: {
        qna_answer: {
          orderBy: { created_at: 'desc' },
          take: 1,
          select: { teacher_id: true, body: true },
        },
      },
    });
    if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');
    if (post.student_id !== student.id)
      throw new ForbiddenException('본인 질문만 상담으로 이어갈 수 있습니다.');
    if (post.escalated_booking_id)
      return { bookingId: post.escalated_booking_id, already: true };
    const ans = post.qna_answer[0];
    const teacherId = ans?.teacher_id ?? post.assigned_teacher_id;
    if (!teacherId)
      throw new BadRequestException(
        '답변한 선생님이 없어 상담으로 이어갈 수 없습니다.',
      );
    const tp = await this.prisma.teacher_profile.findUnique({
      where: { account_id: teacherId },
      select: { center_id: true, grade: true, qna_escalation: true },
    });
    if (!tp) throw new NotFoundException('선생님 정보를 찾을 수 없습니다.');
    if (tp.qna_escalation === false) {
      return {
        ok: false,
        reason: 'not_offered',
        message:
          '이 선생님은 Q&A 후 이어서 상담을 제공하지 않아요. 상담 예약에서 다른 선생님을 찾아보세요.',
      };
    }

    const minutes = await this.booking.defaultMinutes('subject');
    const need = Math.max(1, Math.round(minutes / ESCALATE_SLOT_MIN));
    const content = `Q&A 상담 승격 — 질문: ${(post.body ?? '').slice(0, 120)}${ans?.body ? `\n이전 답변 요약: ${ans.body.slice(0, 120)}` : ''}`;
    const now = new Date();

    // 지난 시각 제외 기준 — 오늘 날짜는 현재(KST) + 30분 리드타임 이후 슬롯만 유효.
    const kstNow = new Date(now.getTime() + 9 * 3600_000);
    const todayStr = kstDateString(now);
    const minTodayMin = kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes() + 30;

    // ② 학생이 후보를 골라 확정 — 그 사이 선점됐을 수 있으니 재검증 후 예약.
    if (pick) {
      if (
        pick.dateStr === todayStr &&
        pick.slotStart * ESCALATE_SLOT_MIN < minTodayMin
      ) {
        return {
          ok: false,
          reason: 'past',
          message: '이미 지난 시간이에요. 다른 시간을 골라주세요.',
        };
      }
      const slots = await this.availability.getDaySlots(
        teacherId,
        pick.dateStr,
        student.id,
      );
      const i = slots.findIndex((sl) => sl.index === pick.slotStart);
      const free =
        i >= 0 &&
        slots.slice(i, i + need).length === need &&
        slots.slice(i, i + need).every((sl) => sl.status === 'avail');
      if (!free)
        return {
          ok: false,
          reason: 'taken',
          message: '방금 다른 예약이 잡혔어요. 다른 시간을 골라주세요.',
        };
      // 첨부 이관 — 생기부 가드 "동일 필터" 통과분만 상담 예약으로 복제(§2·§6 스텝2).
      const attachments = await this.filterEscalationAttachments(
        post.attachments,
      );
      const res = await this.booking.createAssigned({
        studentId: student.id,
        teacherId,
        centerId: tp.center_id,
        teacherGrade: (tp.grade as TeacherGrade) ?? TeacherGrade.B,
        consultType: ConsultType.SUBJECT,
        mode: ConsultMode.CHAT,
        dateStr: pick.dateStr,
        slotStart: pick.slotStart,
        slotEnd: pick.slotStart + need,
        charge: 'session',
        origin: '질문승격',
        content,
        attachments,
      });
      if (res.ok && res.bookingId) {
        await this.prisma.qna_post.update({
          where: { id: postId },
          data: { escalated_booking_id: res.bookingId },
        });
        return { bookingId: res.bookingId };
      }
      if (res.reason === 'shortfall') {
        return {
          ok: false,
          reason: 'shortfall',
          message:
            '크레딧이 부족해 상담 예약을 생성하지 못했어요. 충전 후 다시 시도하거나 상담 예약에서 직접 진행하세요.',
        };
      }
      return {
        ok: false,
        reason: 'failed',
        message: '예약 생성에 실패했어요. 상담 예약에서 직접 진행해 주세요.',
      };
    }

    // ① 후보 제시 — 가까운 빈 시간대(하루 최대 2개·총 4개)를 학생에게 골라 보여준다(예약 생성 없음).
    const candidates: Array<{
      dateStr: string;
      slotStart: number;
      label: string;
    }> = [];
    for (let d = 0; d < ESCALATE_HORIZON_DAYS && candidates.length < 4; d++) {
      const dateStr = kstDateString(new Date(now.getTime() + d * 86_400_000));
      const slots = await this.availability.getDaySlots(
        teacherId,
        dateStr,
        student.id,
      );
      const statuses = slots.map((sl) => sl.status);
      let perDay = 0;
      for (
        let i = 0;
        i < statuses.length && perDay < 2 && candidates.length < 4;
      ) {
        const ok =
          statuses.slice(i, i + need).length === need &&
          statuses.slice(i, i + need).every((s) => s === 'avail');
        if (!ok) {
          i++;
          continue;
        }
        const startMin = slots[i].index * ESCALATE_SLOT_MIN;
        // 오늘의 이미 지난 시각(+리드타임 30분)은 후보에서 제외 — 과거 예약 생성 방지.
        if (dateStr === todayStr && startMin < minTodayMin) {
          i++;
          continue;
        }
        const hh = String(Math.floor(startMin / 60)).padStart(2, '0');
        const mm = String(startMin % 60).padStart(2, '0');
        const dow = ['일', '월', '화', '수', '목', '금', '토'][
          new Date(`${dateStr}T00:00:00+09:00`).getDay()
        ];
        candidates.push({
          dateStr,
          slotStart: slots[i].index,
          label: `${d === 0 ? '오늘' : d === 1 ? '내일' : `${dateStr.slice(5).replace('-', '/')}(${dow})`} ${hh}:${mm}`,
        });
        perDay++;
        i += need + 2; // 같은 구간 연속 후보 방지 — 다음 후보는 간격을 두고
      }
    }
    if (!candidates.length) {
      return {
        ok: false,
        reason: 'no_slot',
        message:
          '가까운 빈 시간을 찾지 못했어요. 상담 예약에서 직접 시간을 골라주세요.',
      };
    }
    return { ok: true, candidates, minutes };
  }

  // ── Q3 커뮤니티(3부 공개 게시판) ───────────────────────────────────────
  /** 커뮤니티 질문 등록(무료·일 3건) — 등록 즉시 AI 초안. */
  async createCommunityQuestion(
    user: AuthUser,
    dto: { subject?: string; difficulty?: string; body: string },
  ) {
    if (user.role !== AccountRole.STUDENT)
      throw new ForbiddenException(
        '학생만 커뮤니티 질문을 등록할 수 있습니다.',
      );
    const key = `qna:comm:${user.id}:${new Date().toISOString().slice(0, 10)}`;
    const used = Number((await this.cache.get<number>(key)) ?? 0);
    if (!withinDailyLimit(used))
      throw new BadRequestException(
        `커뮤니티 질문은 하루 ${COMMUNITY_DAILY_LIMIT}건까지 등록할 수 있어요.`,
      );
    const post = await this.prisma.qna_post.create({
      data: {
        student_id: user.id,
        subject: dto.subject ?? null,
        difficulty: dto.difficulty ?? null,
        scope: 'open',
        status: 'open',
        community: true,
        body: dto.body,
      },
    });
    await this.cache.incr(key, 26 * 3600);
    void this.generateAiDraft(post.id, {
      subject: dto.subject ?? null,
      difficulty: dto.difficulty ?? null,
      body: dto.body,
    });
    return { id: post.id, community: true };
  }

  /** 커뮤니티 목록(로그인 전원) — 미답변 필터·과목·검색·숨김 제외. */
  async listCommunity(
    _user: AuthUser,
    opts?: { filter?: 'unanswered'; subject?: string; q?: string },
  ) {
    const term = (opts?.q ?? '').trim();
    const posts = await this.prisma.qna_post.findMany({
      where: {
        community: true,
        hidden: false,
        ...(opts?.subject ? { subject: opts.subject } : {}),
        ...(term
          ? {
              OR: [
                { subject: { contains: term, mode: 'insensitive' } },
                { body: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { created_at: 'desc' },
      take: 100,
      select: {
        id: true,
        subject: true,
        difficulty: true,
        body: true,
        status: true,
        created_at: true,
        ai_draft: true,
      },
    });
    const ids = posts.map((p) => p.id);
    const counts = ids.length
      ? await this.prisma.qna_community_answer.groupBy({
          by: ['post_id'],
          where: { post_id: { in: ids }, hidden: false },
          _count: { _all: true },
        })
      : [];
    const cmap = new Map(counts.map((c) => [c.post_id, c._count._all]));
    let list = posts.map((p) => ({
      id: p.id,
      subject: p.subject,
      difficulty: p.difficulty,
      body: p.body ?? '',
      status: p.status ?? 'open',
      createdAt: p.created_at,
      answerCount: cmap.get(p.id) ?? 0,
      hasAiDraft: !!p.ai_draft,
    }));
    if (opts?.filter === 'unanswered')
      list = list.filter((p) => p.answerCount === 0);
    return list;
  }

  /** 커뮤니티 상세 — 질문 + AI 초안 + (숨김 제외) 답변 목록(작성자명·채택). */
  async getCommunity(user: AuthUser, postId: string) {
    const post = await this.prisma.qna_post.findUnique({
      where: { id: postId },
    });
    if (!post || !post.community || post.hidden)
      throw new NotFoundException('질문을 찾을 수 없습니다.');
    const answers = await this.prisma.qna_community_answer.findMany({
      where: { post_id: postId, hidden: false },
      orderBy: [{ accepted: 'desc' }, { created_at: 'asc' }],
    });
    const authorIds = [...new Set(answers.map((a) => a.author_id))];
    const accounts = authorIds.length
      ? await this.prisma.account.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true, role: true },
        })
      : [];
    const info = new Map(accounts.map((a) => [a.id, a]));
    return {
      id: post.id,
      subject: post.subject,
      difficulty: post.difficulty,
      body: post.body ?? '',
      status: post.status ?? 'open',
      isOwner: post.student_id === user.id,
      aiDraft: post.ai_draft ?? null,
      createdAt: post.created_at,
      answers: answers.map((a) => ({
        id: a.id,
        body: a.body ?? '',
        accepted: a.accepted,
        aiSimilar: a.ai_similar,
        authorName: info.get(a.author_id)?.name ?? '익명',
        authorRole: info.get(a.author_id)?.role ?? null,
        mine: a.author_id === user.id,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
      })),
    };
  }

  /** 커뮤니티 답변(전원·무정산) — AI 초안 유사 시 미표기 경고. */
  async answerCommunity(user: AuthUser, postId: string, body: string) {
    const post = await this.prisma.qna_post.findUnique({
      where: { id: postId },
    });
    if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');
    const gate = canAnswerCommunity({
      community: post.community,
      hidden: post.hidden,
      status: post.status ?? 'open',
      ownerId: post.student_id,
      userId: user.id,
    });
    if (!gate.allowed) {
      const msg =
        gate.reason === 'owner'
          ? '본인 질문에는 답변할 수 없습니다.'
          : gate.reason === 'resolved'
            ? '이미 채택/마감된 질문입니다.'
            : gate.reason === 'hidden'
              ? '숨김 처리된 질문입니다.'
              : '커뮤니티 질문이 아닙니다.';
      throw new ForbiddenException(msg);
    }
    // 1인 1답변 — 이미 답변했으면 새로 달지 말고 수정하도록(무한 중복 방지).
    const dup = await this.prisma.qna_community_answer.findFirst({
      where: { post_id: postId, author_id: user.id, hidden: false },
      select: { id: true },
    });
    if (dup)
      throw new ConflictException(
        '이미 이 질문에 답변하셨어요. 기존 답변을 수정해 주세요.',
      );
    let similarity = 0;
    let aiSim = false;
    if (post.ai_draft) {
      const sim = await this.llm.checkAnswerSimilarity({
        body,
        priors: [{ id: 'ai', body: post.ai_draft }],
      });
      similarity = sim.maxSimilarity;
      aiSim = aiUnlabeled(sim.maxSimilarity);
    }
    const ans = await this.prisma.qna_community_answer.create({
      data: {
        post_id: postId,
        author_id: user.id,
        body,
        similarity,
        ai_similar: aiSim,
      },
    });
    if (post.first_reply_at == null)
      await this.prisma.qna_post.update({
        where: { id: postId },
        data: { first_reply_at: new Date() },
      });
    void this.notify.notify(post.student_id, 'qna_community_answer', {
      postId,
    }); // 질문자에게 새 답변 알림
    this.realtime?.emitToCommunity(postId, 'community:answer', {
      postId,
      answerId: ans.id,
    }); // 열람 중 사용자 실시간 갱신
    return {
      id: ans.id,
      aiSimilar: aiSim,
      similarity,
      warning: aiSim
        ? 'AI 초안과 매우 유사합니다 — AI 도움을 받았다면 "AI 참고"로 표기해 주세요.'
        : null,
    };
  }

  /** 커뮤니티 답변 채택(질문 학생, 단일) — 답변 accepted + 질문 resolved. */
  /** 커뮤니티 답변 수정 — 본인 답변만, 채택 전·질문 미마감일 때만. 무한 중복 대신 수정으로. */
  async editCommunityAnswer(user: AuthUser, answerId: string, body: string) {
    const ans = await this.prisma.qna_community_answer.findUnique({
      where: { id: answerId },
    });
    if (!ans || ans.hidden)
      throw new NotFoundException('답변을 찾을 수 없습니다.');
    if (ans.author_id !== user.id)
      throw new ForbiddenException('본인 답변만 수정할 수 있어요.');
    if (ans.accepted)
      throw new ForbiddenException('채택된 답변은 수정할 수 없어요.');
    const post = await this.prisma.qna_post.findUnique({
      where: { id: ans.post_id },
      select: { status: true, ai_draft: true },
    });
    if ((post?.status ?? 'open') !== 'open')
      throw new ForbiddenException('마감된 질문의 답변은 수정할 수 없어요.');
    let similarity = Number(ans.similarity ?? 0);
    let aiSim = ans.ai_similar;
    if (post?.ai_draft) {
      const sim = await this.llm.checkAnswerSimilarity({
        body,
        priors: [{ id: 'ai', body: post.ai_draft }],
      });
      similarity = sim.maxSimilarity;
      aiSim = aiUnlabeled(sim.maxSimilarity);
    }
    const upd = await this.prisma.qna_community_answer.update({
      where: { id: answerId },
      data: { body, similarity, ai_similar: aiSim, updated_at: new Date() },
    });
    this.realtime?.emitToCommunity(ans.post_id, 'community:answer', {
      postId: ans.post_id,
      answerId,
    }); // 열람 중 갱신
    return {
      id: upd.id,
      edited: true,
      aiSimilar: aiSim,
      similarity,
      warning: aiSim
        ? 'AI 초안과 매우 유사합니다 — AI 도움을 받았다면 "AI 참고"로 표기해 주세요.'
        : null,
    };
  }

  async acceptCommunityAnswer(user: AuthUser, answerId: string) {
    const ans = await this.prisma.qna_community_answer.findUnique({
      where: { id: answerId },
    });
    if (!ans) throw new NotFoundException('답변을 찾을 수 없습니다.');
    const post = await this.prisma.qna_post.findUnique({
      where: { id: ans.post_id },
    });
    if (!post || post.student_id !== user.id)
      throw new ForbiddenException('본인 질문의 답변만 채택할 수 있습니다.');
    await this.prisma.$transaction(async (tx) => {
      const upd = await tx.qna_post.updateMany({
        where: { id: ans.post_id, status: 'open' },
        data: { status: 'resolved', resolved_at: new Date() },
      });
      if (upd.count !== 1)
        throw new ConflictException('이미 채택/마감된 질문입니다.');
      await tx.qna_community_answer.update({
        where: { id: answerId },
        data: { accepted: true },
      });
    });
    void this.notify.notify(ans.author_id, 'qna_community_accepted', {
      answerId,
    }); // 답변자에게 채택 알림
    this.realtime?.emitToCommunity(ans.post_id, 'community:accepted', {
      postId: ans.post_id,
      answerId,
    }); // 열람 중 사용자 실시간 갱신
    const league = await this.evaluateLeagueFor(ans.author_id); // 채택 → 답변자 리그 재평가(승급·승급 시 알림)
    return {
      id: answerId,
      accepted: true,
      authorLeague: league.tier,
      promoted: league.promoted,
    };
  }

  /** 신고(로그인 전원) — 대상별 1회, 누적 3건 시 자동 숨김. */
  async reportContent(
    user: AuthUser,
    dto: { targetType: 'post' | 'answer'; targetId: string; reason?: string },
  ) {
    try {
      await this.prisma.qna_report.create({
        data: {
          target_type: dto.targetType,
          target_id: dto.targetId,
          reporter_id: user.id,
          reason: dto.reason ?? null,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException('이미 신고한 대상입니다.');
      throw e;
    }
    if (dto.targetType === 'post') {
      const u = await this.prisma.qna_post.update({
        where: { id: dto.targetId },
        data: { report_count: { increment: 1 } },
        select: { report_count: true },
      });
      if (shouldHide(u.report_count))
        await this.prisma.qna_post.update({
          where: { id: dto.targetId },
          data: { hidden: true },
        });
    } else {
      const u = await this.prisma.qna_community_answer.update({
        where: { id: dto.targetId },
        data: { report_count: { increment: 1 } },
        select: { report_count: true },
      });
      if (shouldHide(u.report_count))
        await this.prisma.qna_community_answer.update({
          where: { id: dto.targetId },
          data: { hidden: true },
        });
    }
    return { ok: true };
  }

  /** 커뮤니티 실적(본인 또는 지정) — 답변 수·채택 수·채택률(리그 승급 기반). */
  async communityStats(user: AuthUser, authorId?: string) {
    const id = authorId ?? user.id;
    const [authored, accepted] = await Promise.all([
      this.prisma.qna_community_answer.count({
        where: { author_id: id, hidden: false },
      }),
      this.prisma.qna_community_answer.count({
        where: { author_id: id, accepted: true },
      }),
    ]);
    return {
      authored,
      accepted,
      acceptRate: authored ? Math.round((accepted / authored) * 100) : 0,
    };
  }

  /**
   * 과목별 커뮤니티 실적(본인/지정) — N33 "과목 오각형"(축 B) 원천 신호.
   * 기존 커뮤니티 답변 + 질문 과목에서 산출(마이그레이션·정책값 불요). 숨김 답변 제외.
   * 노출 게이트(n≥5)·타게팅은 N33 후속 — 여기선 데이터 집계만.
   */
  async answererSubjectStats(user: AuthUser, authorId?: string) {
    const id = authorId ?? user.id;
    const answers = await this.prisma.qna_community_answer.findMany({
      where: { author_id: id, hidden: false },
      select: { accepted: true, post_id: true },
    });
    if (answers.length === 0) return { authorId: id, subjects: [] };
    const postIds = [...new Set(answers.map((a) => a.post_id))];
    const posts = await this.prisma.qna_post.findMany({
      where: { id: { in: postIds } },
      select: { id: true, subject: true },
    });
    const subjById = new Map(posts.map((p) => [p.id, p.subject]));
    const policy = await this.getLeaguePolicy();
    const subjects = aggregateSubjectStats(
      answers.map((a) => ({
        subject: subjById.get(a.post_id) ?? null,
        accepted: a.accepted,
      })),
      policy,
    );
    return { authorId: id, subjects };
  }

  // ── N33 축 A(신뢰) — 답변자 자기신고 자격 ────────────────────────────
  /** 내 자기신고 자격 upsert(과목별). verified 승격은 후속 — 여기선 claimed 고정. */
  async upsertMyCredential(
    user: AuthUser,
    dto: { subject: string; claimedGrade?: string; note?: string },
  ) {
    const subject = (dto.subject ?? '').trim();
    if (!subject) throw new BadRequestException('과목을 입력하세요.');
    const row = await this.prisma.answerer_credential.upsert({
      where: { account_id_subject: { account_id: user.id, subject } },
      create: {
        account_id: user.id,
        subject,
        claimed_grade: dto.claimedGrade ?? null,
        note: dto.note ?? null,
      },
      update: {
        claimed_grade: dto.claimedGrade ?? null,
        note: dto.note ?? null,
        updated_at: new Date(),
      },
    });
    return {
      subject: row.subject,
      claimedGrade: row.claimed_grade,
      tier: row.verify_tier,
      badge: credentialBadge(row.verify_tier),
    };
  }

  /** 답변자 자격 목록(본인/지정) + 배지 라벨. */
  async listCredentials(user: AuthUser, authorId?: string) {
    const id = authorId ?? user.id;
    const rows = await this.prisma.answerer_credential.findMany({
      where: { account_id: id },
      orderBy: { subject: 'asc' },
    });
    return rows.map((r) => ({
      subject: r.subject,
      claimedGrade: r.claimed_grade,
      tier: r.verify_tier,
      badge: credentialBadge(r.verify_tier),
    }));
  }

  /** 내 자격 삭제(과목). */
  async deleteMyCredential(user: AuthUser, subject: string) {
    await this.prisma.answerer_credential.deleteMany({
      where: { account_id: user.id, subject },
    });
    return { ok: true };
  }

  // ── N33 축 B(능력·설명방식 오각형) — 답변 수령자 재평가 ──────────────
  /** 답변 재평가(축별 1~5) — 내 질문의 답변만, 본인 답변 제외. 재평가 시 갱신(upsert). */
  async rateAnswer(
    user: AuthUser,
    answerId: string,
    ratings: Array<{ axis: string; score: number }>,
  ) {
    const ans = await this.prisma.qna_community_answer.findUnique({
      where: { id: answerId },
    });
    if (!ans) throw new NotFoundException('답변을 찾을 수 없습니다.');
    if (ans.author_id === user.id)
      throw new ForbiddenException('본인 답변은 평가할 수 없습니다.');
    const post = await this.prisma.qna_post.findUnique({
      where: { id: ans.post_id },
      select: { student_id: true },
    });
    if (!post || post.student_id !== user.id)
      throw new ForbiddenException('내 질문의 답변만 평가할 수 있습니다.');
    const valid = (ratings ?? []).filter(
      (r) => isValidAxis(r.axis) && isValidScore(r.score),
    );
    if (valid.length === 0)
      throw new BadRequestException('유효한 평가(축·점수)가 없습니다.');
    await this.prisma.$transaction(
      valid.map((r) =>
        this.prisma.answer_rating.upsert({
          where: {
            answer_id_rater_id_axis: {
              answer_id: answerId,
              rater_id: user.id,
              axis: r.axis,
            },
          },
          create: {
            answer_id: answerId,
            rater_id: user.id,
            axis: r.axis,
            score: r.score,
          },
          update: { score: r.score },
        }),
      ),
    );
    return { answerId, rated: valid.length };
  }

  /** 답변자 설명방식 오각형(본인/지정) — 축별 평균(표본 미달 축은 null·게이트). */
  async answererAxisStats(user: AuthUser, authorId?: string) {
    const id = authorId ?? user.id;
    const answers = await this.prisma.qna_community_answer.findMany({
      where: { author_id: id },
      select: { id: true },
    });
    if (answers.length === 0) {
      const axes = aggregateAxisStats([]);
      return { authorId: id, axes, visible: isPentagonVisible(axes) };
    }
    const rows = await this.prisma.answer_rating.findMany({
      where: { answer_id: { in: answers.map((a) => a.id) } },
      select: { axis: true, score: true },
    });
    const axes = aggregateAxisStats(rows);
    return { authorId: id, axes, visible: isPentagonVisible(axes) };
  }

  // ── Q3 리그(3부→2부→1부) ─────────────────────────────────────────────
  private static readonly LEAGUE_POLICY_KEY = 'qna_league_policy';

  /** 승급 정책값 — system_setting override + 코드 기본값(N27 확정 전). */
  async getLeaguePolicy(): Promise<LeaguePolicy> {
    const row = await this.prisma.system_setting.findUnique({
      where: { key: QnaService.LEAGUE_POLICY_KEY },
    });
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
      create: {
        key: QnaService.LEAGUE_POLICY_KEY,
        value: policy as unknown as Prisma.InputJsonValue,
      },
      update: { value: policy as unknown as Prisma.InputJsonValue },
    });
    return this.getLeaguePolicy();
  }

  /** 한 계정의 실적을 재평가해 qna_league 갱신(승급 시 promoted_at·플래그). */
  async evaluateLeagueFor(accountId: string): Promise<{
    tier: number;
    promoted: boolean;
    authored: number;
    accepted: number;
    acceptRate: number;
  }> {
    const stats = await this.communityStatsRaw(accountId);
    const policy = await this.getLeaguePolicy();
    const tier = evaluateLeague(stats, policy);
    const prev = await this.prisma.qna_league.findUnique({
      where: { account_id: accountId },
    });
    const promoted = tier < (prev?.tier ?? 3); // 낮을수록 상위
    await this.prisma.qna_league.upsert({
      where: { account_id: accountId },
      create: {
        account_id: accountId,
        tier,
        authored: stats.authored,
        accepted: stats.accepted,
        accept_rate: stats.acceptRate,
        promoted_at: tier < 3 ? new Date() : null,
      },
      update: {
        tier,
        authored: stats.authored,
        accepted: stats.accepted,
        accept_rate: stats.acceptRate,
        evaluated_at: new Date(),
        ...(promoted ? { promoted_at: new Date() } : {}),
      },
    });
    if (promoted)
      void this.notify.notify(accountId, 'qna_league_promoted', {
        tier,
        label: TIER_LABEL[tier],
      }); // 승급 알림
    return { tier, promoted, ...stats };
  }

  /** 실적 집계(내부) — communityStats 재사용용. */
  private async communityStatsRaw(
    accountId: string,
  ): Promise<{ authored: number; accepted: number; acceptRate: number }> {
    const [authored, accepted] = await Promise.all([
      this.prisma.qna_community_answer.count({
        where: { author_id: accountId, hidden: false },
      }),
      this.prisma.qna_community_answer.count({
        where: { author_id: accountId, accepted: true },
      }),
    ]);
    return {
      authored,
      accepted,
      acceptRate: authored ? Math.round((accepted / authored) * 100) : 0,
    };
  }

  /** 내 리그 현황 — 등급·라벨·다음 등급 요건·진행도(로그인 전원). */
  async myLeague(user: AuthUser) {
    const cur = await this.evaluateLeagueFor(user.id);
    const policy = await this.getLeaguePolicy();
    const next = nextTierNeed(cur.tier, policy);
    return {
      tier: cur.tier,
      label: TIER_LABEL[cur.tier],
      authored: cur.authored,
      accepted: cur.accepted,
      acceptRate: cur.acceptRate,
      next: next
        ? { tier: next.tier, label: TIER_LABEL[next.tier], rule: next.rule }
        : null,
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
      where: { tier: { lt: 3 } },
      orderBy: [{ tier: 'asc' }, { accepted: 'desc' }],
      take: Math.min(50, Math.max(1, limit)),
    });
    const ids = rows.map((r) => r.account_id);
    const accounts = ids.length
      ? await this.prisma.account.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, role: true },
        })
      : [];
    const info = new Map(accounts.map((a) => [a.id, a]));
    return rows.map((r) => ({
      tier: r.tier,
      label: TIER_LABEL[r.tier],
      name: info.get(r.account_id)?.name ?? '익명',
      role: info.get(r.account_id)?.role ?? null,
      accepted: r.accepted,
      authored: r.authored,
      acceptRate: r.accept_rate,
    }));
  }

  /** Q3 AI 1차 초안 생성(비동기·일일 비용상한·실패 무해) → qna_post.ai_draft 저장. */
  private async generateAiDraft(
    postId: string,
    q: { subject: string | null; difficulty: string | null; body: string },
  ) {
    try {
      const limit = Number(process.env.QNA_AI_DAILY_LIMIT ?? 200);
      const key = `qna:aidraft:${new Date().toISOString().slice(0, 10)}`; // 일자 러프 상한
      const used = Number((await this.cache.get<number>(key)) ?? 0);
      if (used >= limit) return;
      await this.cache.incr(key, 26 * 3600);
      const draft = await this.llm.draftAnswer({
        subject: q.subject,
        difficulty: q.difficulty,
        body: q.body,
      });
      if (draft?.body?.trim()) {
        await this.prisma.qna_post.update({
          where: { id: postId },
          data: { ai_draft: draft.body.trim(), ai_draft_at: new Date() },
        });
      }
    } catch (e) {
      this.logger.warn(`AI 초안 생성 실패(무해): ${(e as Error).message}`);
    }
  }
}
