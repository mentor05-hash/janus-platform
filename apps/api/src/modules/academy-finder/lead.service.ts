import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FunnelService } from '../funnel/funnel.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { LeadSubmitDto } from './dto/lead.dto';
import { toJson } from '../../common/prisma/json';

type LeadSummary = {
  message: string | null;
  shared: {
    name?: string | null;
    grade?: string | null;
    goalTier?: string | null;
    contact?: string | null;
  };
  consentScope: string[];
  reply?: { text: string; at: string } | null;
};

/**
 * 상담 신청(리드) — 스펙 §7-3. 전달 정보는 요약+동의 범위만, 개별 성적 상세 미포함(§4).
 * 인박스 왕복: 학생 신청 → 운영자 열람·응답 → 학생이 상태·응답 확인.
 */
@Injectable()
export class LeadService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly funnel?: FunnelService,
  ) {}

  /** 학생이 실제 공유할 요약(미리보기와 동일 값). 성적 상세는 절대 포함하지 않는다. */
  async preview(user: AuthUser) {
    const [account, profile] = await Promise.all([
      this.prisma.account.findUnique({
        where: { id: user.id },
        select: { name: true },
      }),
      this.prisma.student_profile.findUnique({
        where: { account_id: user.id },
        select: { school_grade: true, goal_tier: true },
      }),
    ]);
    return {
      name: account?.name ?? null,
      grade: profile?.school_grade ?? null,
      goalTier: profile?.goal_tier ?? null,
    };
  }

  /** POST /academies/:academyId/leads — 상담 신청. */
  async submit(user: AuthUser, academyId: string, dto: LeadSubmitDto) {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: { id: true },
    });
    if (!academy) throw new NotFoundException('학원을 찾을 수 없습니다.');
    if (dto.classId) {
      const cls = await this.prisma.academy_class.findFirst({
        where: { id: dto.classId, academy_id: academyId },
      });
      if (!cls) throw new BadRequestException('해당 학원의 반이 아닙니다.');
    }

    const p = await this.preview(user);
    const consentScope: string[] = [];
    const shared: LeadSummary['shared'] = {};
    if (dto.shareName) {
      shared.name = p.name;
      consentScope.push('name');
    }
    if (dto.shareGrade) {
      shared.grade = p.grade;
      consentScope.push('grade');
    }
    if (dto.shareGoal) {
      shared.goalTier = p.goalTier;
      consentScope.push('goalTier');
    }
    if (dto.contact) {
      shared.contact = dto.contact;
      consentScope.push('contact');
    }

    const summary: LeadSummary = {
      message: dto.message ?? null,
      shared,
      consentScope,
      reply: null,
    };
    const lead = await this.prisma.academy_lead.create({
      data: {
        user_id: user.id,
        academy_id: academyId,
        class_id: dto.classId ?? null,
        summary_json: toJson(summary),
        status: 'sent',
      },
    });
    // 검색→리드 전환 계측(세션6 접합). 실패해도 신청은 유효(fire-and-forget).
    await this.funnel
      ?.record({
        page: 'academy',
        event: 'cta',
        cta: 'lead',
        sessionId: dto.sessionId,
        meta: { academyId },
      })
      .catch(() => undefined);
    return { id: lead.id, status: lead.status, consentScope };
  }

  /** GET /leads/mine — 내 상담 신청(상태·운영자 응답 포함). */
  async mine(user: AuthUser) {
    const rows = await this.prisma.academy_lead.findMany({
      where: { user_id: user.id },
      orderBy: { ts: 'desc' },
      include: { academy: { select: { id: true, name: true } } },
    });
    return rows.map((l) => {
      const s = (l.summary_json ?? {}) as LeadSummary;
      return {
        id: l.id,
        academy: l.academy,
        status: l.status,
        message: s.message ?? null,
        consentScope: s.consentScope ?? [],
        reply: s.reply ?? null,
        ts: l.ts,
      };
    });
  }
}
