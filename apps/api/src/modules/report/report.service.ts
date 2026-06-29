import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import { canReportTransition, ReportStatus } from './domain/report';
import { CreateReportDto, HandleReportDto } from './dto/report.dto';
import { LLM_PROVIDER } from './llm/llm.types';
import type { LlmProvider } from './llm/llm.types';

/**
 * 신고 (CLAUDE.md §6 Phase 3). 등록 시 LlmProvider 로 AI 1차 검토 결과 첨부,
 * 관리자가 상태머신(received→reviewing→resolved/dismissed)으로 처리.
 */
@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  async create(reporter: AuthUser, dto: CreateReportDto) {
    const review = await this.llm.reviewReport({ targetType: dto.targetType, reason: dto.reason });
    const report = await this.prisma.report.create({
      data: {
        target_type: dto.targetType,
        target_id: dto.targetId ?? null,
        reason: dto.reason,
        status: 'received',
        center_id: reporter.centerId ?? null, // 센터 스코프(M2)
        ai_review: review as object, // AI 1차 검토 결과 보존(M3) — action 과 분리
      },
    });
    return { id: report.id, status: report.status, aiFlagged: review.flagged, aiSummary: review.summary };
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
    if (actor.centerId && report.center_id && report.center_id !== actor.centerId) {
      throw new ForbiddenException('다른 센터의 신고는 처리할 수 없습니다.');
    }
    const from = (report.status ?? 'received') as ReportStatus;
    if (!canReportTransition(from, dto.status)) {
      throw new BadRequestException(`허용되지 않는 신고 상태 전이: ${from} → ${dto.status}`);
    }
    // 조건부 전이(동시 처리 1회만 적용 — 비원자성 가드)
    const upd = await this.prisma.report.updateMany({
      where: { id, status: from as never },
      data: { status: dto.status, ...(dto.action ? { action: dto.action } : {}) },
    });
    if (upd.count !== 1) throw new ConflictException('이미 처리된 신고입니다.');
    return { id, status: dto.status, action: dto.action ?? report.action };
  }
}
