import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { getRequestId } from '../../common/observability/request-context';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';

export type AuditEntry = {
  action: string;
  targetType?: string;
  targetId?: string;
  summary?: string;
  meta?: Record<string, unknown>;
};

/** 관리자 감사 로그 — 민감 조작(정책·급여·조직·평가) 기록·열람. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  constructor(private readonly prisma: PrismaService) {}

  /** 조작 기록(실패해도 본 작업을 막지 않도록 삼킨다). actor.name 은 조회 최소화 위해 선택. */
  async record(actor: AuthUser, entry: AuditEntry, actorName?: string) {
    try {
      await this.prisma.audit_log.create({
        data: {
          actor_id: actor.id,
          actor_name: actorName ?? null,
          actor_role: actor.role,
          action: entry.action,
          target_type: entry.targetType ?? null,
          target_id: entry.targetId ?? null,
          summary: entry.summary ?? null,
          meta: (entry.meta ?? undefined) as Prisma.InputJsonValue | undefined,
          center_id: actor.centerId ?? null,
          request_id: getRequestId() ?? null,
        },
      });
    } catch (e) {
      this.logger.warn(
        `감사 로그 기록 실패: ${entry.action} — ${(e as Error).message}`,
      );
    }
  }

  /** 열람: 관리자/HR. 자기 센터(HQ=전사). action 접두어 필터(선택). */
  async list(actor: AuthUser, prefix?: string, limit = 200) {
    const isHq = actor.role === AccountRole.ADMIN && !actor.centerId;
    return this.prisma.audit_log.findMany({
      where: {
        ...(isHq ? {} : { center_id: actor.centerId }),
        ...(prefix ? { action: { startsWith: prefix } } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: Math.min(limit, 500),
    });
  }
}
