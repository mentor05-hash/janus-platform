import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

type AppealRow = {
  id: string;
  reason: string;
  surface: string | null;
  note: string | null;
  actor_id: string | null;
  actor_role: string | null;
  status: string;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

/**
 * 생기부 차단 이의(오탐 신고) 큐 (지시서 §6 스텝3, §4-b 이의 경로).
 *
 * 무취급(§1-2): 저장하는 것은 사유 코드·표면·**신고자 본인이 작성한 문장(note)**·상태뿐이다.
 * 차단된 파일 자체나 추출 텍스트는 첨부·저장하지 않는다. note 는 서버에서 길이를 제한한다.
 */
@Injectable()
export class SchoolRecordAppealService {
  private readonly MAX_NOTE = 2000;

  constructor(private readonly prisma: PrismaService) {}

  /** 사용자 이의 접수 — 로그인 사용자 누구나(§4-b 모달의 "문의하기"). */
  async create(actor: AuthUser, dto: { reason: string; surface?: string; note?: string }) {
    const row = await this.prisma.school_record_appeal.create({
      data: {
        reason: dto.reason,
        surface: dto.surface ?? null,
        note: dto.note ? dto.note.slice(0, this.MAX_NOTE) : null,
        actor_id: actor?.id ?? null,
        actor_role: actor?.role ?? null,
      },
    });
    return this.toDto(row);
  }

  /** 관리자 큐 — 상태 필터 + 페이지네이션. 미처리(open) 건수를 meta 에 함께 반환. */
  async list(q: { status?: string; page?: number; size?: number }) {
    const page = Math.max(1, q.page ?? 1);
    const size = Math.min(100, Math.max(1, q.size ?? 20));
    const where: Prisma.school_record_appealWhereInput = {};
    if (q.status) where.status = q.status;
    const [rows, total, openCount] = await this.prisma.$transaction([
      this.prisma.school_record_appeal.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.school_record_appeal.count({ where }),
      this.prisma.school_record_appeal.count({ where: { status: 'open' } }),
    ]);
    return { data: rows.map((r) => this.toDto(r)), meta: { page, size, total, openCount } };
  }

  /** 상태 갱신(관리자) — reviewing/resolved/rejected + 처리 메모. resolved/rejected 시 처리자·시각 기록. */
  async updateStatus(actor: AuthUser, id: string, dto: { status: string; resolution?: string }) {
    const existing = await this.prisma.school_record_appeal.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('이의 신고를 찾을 수 없습니다.');
    const closed = dto.status === 'resolved' || dto.status === 'rejected';
    const row = await this.prisma.school_record_appeal.update({
      where: { id },
      data: {
        status: dto.status,
        resolution:
          dto.resolution !== undefined
            ? dto.resolution.slice(0, this.MAX_NOTE)
            : existing.resolution,
        resolved_by: closed ? actor.id : null,
        resolved_at: closed ? new Date() : null,
        updated_at: new Date(),
      },
    });
    return this.toDto(row);
  }

  private toDto(r: AppealRow) {
    return {
      id: r.id,
      reason: r.reason,
      surface: r.surface,
      note: r.note,
      actorRole: r.actor_role,
      status: r.status,
      resolution: r.resolution,
      resolvedBy: r.resolved_by,
      resolvedAt: r.resolved_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}
