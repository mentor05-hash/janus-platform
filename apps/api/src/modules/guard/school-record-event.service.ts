import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/** 차단 1건의 기록 입력(메타데이터만 — 파일명·내용 없음). */
export interface BlockEventInput {
  /** SR_FILENAME|SR_KEYWORD|SR_VISION|SR_UNSURE|CONSULTING_UPLOAD_DISABLED */
  reason: string;
  /** filename|keyword|vision|policy (판정 단계, 선택). */
  stage?: string | null;
  /** upload|scores_ocr|consulting_intake|qna_escalation|... */
  surface?: string;
  actorId?: string | null;
  actorRole?: string | null;
}

/**
 * 생기부 차단 통계 기록·집계 (지시서 §6 스텝3, 완료기준 "사유 코드별 집계").
 *
 * 무취급(§1-2): 기록하는 것은 사유 코드·표면·단계·시각·행위자 id/role 뿐이다.
 * 파일명·추출 텍스트·원본 바이트는 저장하지 않는다(현행 로그가 파일명을 남기는 것보다도 보수적 —
 * 파일명이 PII(학생명 등)를 포함할 수 있어 DB 영속 대상에서 제외).
 */
@Injectable()
export class SchoolRecordEventService {
  private readonly logger = new Logger(SchoolRecordEventService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 차단 1건 기록 — 최선노력. 실패해도 차단 흐름(예외 던지기)을 막지 않는다. */
  async record(evt: BlockEventInput): Promise<void> {
    try {
      await this.prisma.school_record_block_event.create({
        data: {
          reason: evt.reason,
          stage: evt.stage ?? null,
          surface: evt.surface ?? 'unknown',
          actor_id: evt.actorId ?? null,
          actor_role: evt.actorRole ?? null,
        },
      });
    } catch (e) {
      this.logger.warn(`차단 통계 기록 실패(무시): ${(e as Error).message}`);
    }
  }

  /** 사유 코드별 집계 + 표면별 집계 + 총계 + 최근 N건. from/to 로 기간 필터. */
  async stats(range?: { from?: Date; to?: Date }, recentLimit = 50) {
    const where: Prisma.school_record_block_eventWhereInput = {};
    if (range?.from || range?.to) {
      where.created_at = {
        ...(range.from ? { gte: range.from } : {}),
        ...(range.to ? { lte: range.to } : {}),
      };
    }
    const [byReason, bySurface, total, recent] = await Promise.all([
      this.prisma.school_record_block_event.groupBy({
        by: ['reason'],
        where,
        _count: { _all: true },
      }),
      this.prisma.school_record_block_event.groupBy({
        by: ['surface'],
        where,
        _count: { _all: true },
      }),
      this.prisma.school_record_block_event.count({ where }),
      this.prisma.school_record_block_event.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: recentLimit,
      }),
    ]);
    return {
      total,
      byReason: byReason
        .map((r) => ({ reason: r.reason, count: r._count._all }))
        .sort((a, b) => b.count - a.count),
      bySurface: bySurface
        .map((r) => ({ surface: r.surface, count: r._count._all }))
        .sort((a, b) => b.count - a.count),
      recent: recent.map((e) => ({
        id: e.id,
        reason: e.reason,
        stage: e.stage,
        surface: e.surface,
        actorRole: e.actor_role,
        createdAt: e.created_at,
      })),
    };
  }
}
