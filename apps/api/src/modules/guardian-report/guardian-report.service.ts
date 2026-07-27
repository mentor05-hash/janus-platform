import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import { toJanusScore } from '../scores/domain/janus-score';
import {
  buildParentReport,
  type ParentReport,
  type ParentReportConsult,
  type ParentReportSessions,
} from './domain/parent-report';

/**
 * 학부모 주간 통합 리포트 — 자녀(연결된 학생)의 성적·세션(출석)·상담·Q&A 를 한 리포트로.
 * 자체 prisma 수집(모듈 간 서비스 주입 회피). 권한: guardian↔student 링크 존재 시에만.
 */
@Injectable()
export class GuardianReportService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertLinked(guardian: AuthUser, studentId: string) {
    if (guardian.role !== AccountRole.GUARDIAN)
      throw new ForbiddenException('학부모만 사용할 수 있습니다.');
    const link = await this.prisma.guardian_student_link.findFirst({
      where: {
        guardian_id: guardian.id,
        student_id: studentId,
        status: 'approved',
      },
    });
    if (!link) throw new ForbiddenException('연결된 자녀가 아닙니다.');
  }

  async report(
    guardian: AuthUser,
    studentId: string,
    days = 7,
  ): Promise<ParentReport> {
    await this.assertLinked(guardian, studentId);
    const account = await this.prisma.account.findUnique({
      where: { id: studentId },
      select: { name: true },
    });
    if (!account) throw new NotFoundException('자녀 계정을 찾을 수 없습니다.');
    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 3600 * 1000);

    // 성적(최신) → janus_score
    const report = await this.prisma.score_report.findFirst({
      where: { student_id: studentId },
      orderBy: { period: 'desc' },
      include: { items: true },
    });
    const js = toJanusScore(
      report && {
        period: report.period,
        source: report.source,
        placement: (report.placement as Record<string, unknown> | null) ?? null,
        items: report.items.map((i) => ({
          subject: i.subject,
          score: i.score == null ? null : Number(i.score),
          grade: i.grade,
        })),
      },
    );
    const score = js
      ? { gye: js.gye, mode: js.mode, nb: js.nb, period: js.period }
      : null;

    // 세션(출석) — 최근 주 + 임박 예정
    const horizon = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
    const bookings = await this.prisma.booking.findMany({
      where: { student_id: studentId, start_at: { gte: since, lte: horizon } },
      select: { status: true, start_at: true },
    });
    const sessions: ParentReportSessions = {
      done: 0,
      upcoming: 0,
      noshow: 0,
      cancelled: 0,
    };
    for (const b of bookings) {
      const future = b.start_at != null && b.start_at > now;
      if (b.status === 'done') sessions.done += 1;
      else if (b.status === 'noshow') sessions.noshow += 1;
      else if (b.status === 'cancelled' || b.status === 'rejected')
        sessions.cancelled += 1;
      else if ((b.status === 'new' || b.status === 'confirmed') && future)
        sessions.upcoming += 1;
    }

    // 상담 기록(핵심 요약만 — 민감 원문 제외)
    const notes = await this.prisma.consultation_note.findMany({
      where: { student_id: studentId, created_at: { gte: since } },
      orderBy: { created_at: 'desc' },
      take: 5,
      select: { core_summary: true, created_at: true, teacher_id: true },
    });
    const teacherIds = [...new Set(notes.map((n) => n.teacher_id))];
    const teachers = teacherIds.length
      ? await this.prisma.account.findMany({
          where: { id: { in: teacherIds } },
          select: { id: true, name: true },
        })
      : [];
    const tName = new Map(teachers.map((t) => [t.id, t.name]));
    const consultations: ParentReportConsult[] = notes.map((n) => ({
      at: n.created_at.toISOString(),
      teacher: tName.get(n.teacher_id),
      summary: n.core_summary ?? null,
    }));

    // Q&A 활동(작성 질문 수)
    const qnaCount = await this.prisma.qna_post.count({
      where: { student_id: studentId, created_at: { gte: since } },
    });

    return buildParentReport({
      studentName: account.name,
      periodDays: days,
      score,
      sessions,
      consultations,
      qnaCount,
    });
  }
}
