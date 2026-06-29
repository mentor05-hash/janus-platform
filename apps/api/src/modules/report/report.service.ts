import {
  BadRequestException,
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
        action: `AI:${review.flagged ? 'flagged' : 'clear'} | ${review.summary} | suggest=${review.suggestedAction}`,
      },
    });
    return { id: report.id, status: report.status, aiFlagged: review.flagged, aiSummary: review.summary };
  }

  async list(actor: AuthUser) {
    if (actor.role !== AccountRole.ADMIN && actor.role !== AccountRole.HR) {
      throw new ForbiddenException('관리자만 신고를 조회할 수 있습니다.');
    }
    return this.prisma.report.findMany({ orderBy: { created_at: 'desc' }, take: 200 });
  }

  async handle(id: string, dto: HandleReportDto, actor: AuthUser) {
    if (actor.role !== AccountRole.ADMIN && actor.role !== AccountRole.HR) {
      throw new ForbiddenException('관리자만 신고를 처리할 수 있습니다.');
    }
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('신고를 찾을 수 없습니다.');
    if (!canReportTransition((report.status ?? 'received') as ReportStatus, dto.status)) {
      throw new BadRequestException(`허용되지 않는 신고 상태 전이: ${report.status} → ${dto.status}`);
    }
    const updated = await this.prisma.report.update({
      where: { id },
      data: { status: dto.status, ...(dto.action ? { action: dto.action } : {}) },
      select: { id: true, status: true, action: true },
    });
    return updated;
  }
}
