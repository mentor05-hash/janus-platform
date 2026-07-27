import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { DiagnosticService } from '../diagnostic/diagnostic.service';
import { buildWeeklyPlan, type PlanScore } from './domain/curriculum';

/** 주간 학습 플랜 — 최신 진단 약점 + 최신 성적 → 처방 카드(진단·격차·질문·자료로 연결). */
@Injectable()
export class CurriculumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly diag: DiagnosticService,
  ) {}

  async myPlan(user: AuthUser) {
    if (user.role !== AccountRole.STUDENT)
      throw new ForbiddenException('학생만 학습 플랜을 볼 수 있습니다.');

    // 1) 최신 진단 → 약점 유형
    let weak: { subject: string; unit: string; rate: number }[] = [];
    let attemptId: string | null = null;
    const { attempts } = await this.diag.myHistory(user);
    if (attempts.length) {
      attemptId = attempts[0].id;
      const detail = await this.diag.detail(user, attemptId);
      weak = detail.units
        .filter((u) => u.weak)
        .map((u) => ({ subject: u.subject, unit: u.unit, rate: u.rate }));
    }

    // 2) 최신 성적 → 요약 라벨
    const report = await this.prisma.score_report.findFirst({
      where: { student_id: user.id },
      orderBy: { period: 'desc' },
    });
    const pl = (report?.placement as Record<string, unknown> | null) ?? null;
    const nb = pl?.nb;
    const score: PlanScore = report
      ? {
          hasScore: true,
          label:
            typeof nb === 'number'
              ? `전국누백 ${nb}% · ${(pl?.gye as string) ?? '계열 미상'}`
              : `표점 입력 · ${(pl?.gye as string) ?? '계열 미상'}`,
        }
      : { hasScore: false, label: '성적 미입력 — 성적진단에서 입력하세요' };

    return { ...buildWeeklyPlan(weak, score), latestAttemptId: attemptId };
  }
}
