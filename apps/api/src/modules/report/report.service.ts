import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import { envInt } from '../../common/quota/usage-quota';
import {
  SubjectQuota,
  SubjectQuotaExceededError,
} from '../../common/quota/subject-quota';
import { AI_USAGE_DEFAULT } from '../pricing-policy/domain/ai-usage-policy';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import { canReportTransition, ReportStatus } from './domain/report';
import { CreateReportDto, HandleReportDto } from './dto/report.dto';
import { LLM_PROVIDER } from '../llm/llm.types';
import type { LlmProvider } from '../llm/llm.types';

/**
 * 신고 (CLAUDE.md §6 Phase 3). 등록 시 LlmProvider 로 AI 1차 검토 결과 첨부,
 * 관리자가 상태머신(received→reviewing→resolved/dismissed)으로 처리.
 */
@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);
  private readonly subject: SubjectQuota;
  /** 사용자 1인 일 AI 검토 횟수(B221 1층). ENV 우선, 없으면 정책 기본값. */
  private readonly perUserDay: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Inject(CACHE_PROVIDER) cache: CacheProvider,
    config: ConfigService,
  ) {
    this.subject = new SubjectQuota(cache, 'llm');
    this.perUserDay = envInt(
      config.get<string>('LLM_REPORT_REVIEW_PER_USER_DAY'),
      AI_USAGE_DEFAULT.reportReviewPerUserDay,
    );
  }

  /**
   * 신고 등록. AI 1차 검토를 붙이지만 **검토 실패가 접수를 막지 않는다**.
   *
   * 신고는 안전 기능이다(괴롭힘·부적절 행위 신고). 예전 구현은 `reviewReport()` 를 먼저
   * 호출하고 그 결과로 row 를 만들었기 때문에, LLM 장애나 비용 상한 도달이 곧
   * **신고 접수 전면 중단**이었다 — 비용 보호가 안전 기능을 껐다는 뜻이라 순서가 잘못됐다.
   * 그래서 검토는 best-effort 로 내리고, 실패해도 신고는 항상 접수된다(`ai_review: null`).
   *
   * 또 이 엔드포인트는 모든 인증 사용자에게 열려 있어 호출마다 유료 LLM 이 돈다.
   * 사용자별 일 한도(1층)를 먼저 걸어 한 명이 공유 예산을 태우지 못하게 한다.
   */
  async create(reporter: AuthUser, dto: CreateReportDto) {
    const review = await this.reviewBestEffort(reporter, dto);
    const report = await this.prisma.report.create({
      data: {
        target_type: dto.targetType,
        target_id: dto.targetId ?? null,
        reason: dto.reason,
        status: 'received',
        center_id: reporter.centerId ?? null, // 센터 스코프(M2)
        ai_review: (review ?? null) as unknown as Prisma.InputJsonValue, // AI 1차 검토 결과 보존(M3)
      },
    });
    return {
      id: report.id,
      status: report.status,
      // 검토를 못 붙였으면 미검토 상태로 정직하게 내려보낸다(관리자 화면이 구분해야 한다).
      aiReviewed: review !== null,
      aiFlagged: review?.flagged ?? null,
      aiSeverity: review?.severity ?? null,
      aiSummary: review?.summary ?? null,
    };
  }

  /**
   * AI 검토 시도. 실패 사유(사용자 한도·전역 상한·모델 오류)를 구분해 로그만 남기고 null.
   * 신고 접수 자체는 절대 막지 않는다.
   */
  private async reviewBestEffort(reporter: AuthUser, dto: CreateReportDto) {
    try {
      await this.subject.consume(
        'abuse',
        'report_review',
        reporter.id,
        this.perUserDay,
        'day',
      );
    } catch (e) {
      if (e instanceof SubjectQuotaExceededError) {
        this.logger.warn(
          `[report] 사용자 일 AI 검토 한도 초과 — 검토 없이 접수: user=${reporter.id}`,
        );
        return null;
      }
      throw e;
    }
    try {
      return await this.llm.reviewReport({
        targetType: dto.targetType,
        reason: dto.reason,
      });
    } catch {
      // 전역 상한(503)·모델 오류 모두 여기로 온다 — 접수는 계속한다.
      this.logger.warn('[report] AI 검토 실패 — 검토 없이 접수');
      return null;
    }
  }

  async list(actor: AuthUser) {
    if (actor.role !== AccountRole.ADMIN && actor.role !== AccountRole.HR) {
      throw new ForbiddenException('관리자만 신고를 조회할 수 있습니다.');
    }
    // 자기 센터 신고만(M2). centerId 없으면(HQ) 전체.
    return this.prisma.report.findMany({
      where: actor.centerId ? { center_id: actor.centerId } : {},
      orderBy: { created_at: 'desc' },
      take: 200,
    });
  }

  async handle(id: string, dto: HandleReportDto, actor: AuthUser) {
    if (actor.role !== AccountRole.ADMIN && actor.role !== AccountRole.HR) {
      throw new ForbiddenException('관리자만 신고를 처리할 수 있습니다.');
    }
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('신고를 찾을 수 없습니다.');
    if (
      actor.centerId &&
      report.center_id &&
      report.center_id !== actor.centerId
    ) {
      throw new ForbiddenException('다른 센터의 신고는 처리할 수 없습니다.');
    }
    const from = (report.status ?? 'received') as ReportStatus;
    if (!canReportTransition(from, dto.status)) {
      throw new BadRequestException(
        `허용되지 않는 신고 상태 전이: ${from} → ${dto.status}`,
      );
    }
    // 조건부 전이(동시 처리 1회만 적용 — 비원자성 가드)
    const upd = await this.prisma.report.updateMany({
      where: { id, status: from },
      data: {
        status: dto.status,
        ...(dto.action ? { action: dto.action } : {}),
      },
    });
    if (upd.count !== 1) throw new ConflictException('이미 처리된 신고입니다.');
    return { id, status: dto.status, action: dto.action ?? report.action };
  }
}
