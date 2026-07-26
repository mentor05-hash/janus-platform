import { Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BookingStatus } from '../../config/enums';

/**
 * 운영 통계 대시보드 (CLAUDE.md §ops). 관리자/HR 권한. 응답 {data, meta} 규약.
 */
@Injectable()
export class OpsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(actor: AuthUser, now = new Date()) {
    const centerId = actor.centerId;
    const centerWhere = centerId ? { center_id: centerId } : {};
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

    const [
      activeUsers,
      totalBookings,
      doneTotal,
      weeklyConsult,
      confirmedUpcoming,
      teachers,
    ] = await Promise.all([
      this.prisma.account.count({
        where: {
          status: 'approved',
          ...(centerId ? { center_id: centerId } : {}),
        },
      }),
      this.prisma.booking.count({ where: centerWhere }),
      this.prisma.booking.count({
        where: { ...centerWhere, status: BookingStatus.DONE },
      }),
      this.prisma.booking.count({
        where: {
          ...centerWhere,
          status: BookingStatus.DONE,
          start_at: { gte: weekAgo },
        },
      }),
      this.prisma.booking.count({
        where: { ...centerWhere, status: BookingStatus.CONFIRMED },
      }),
      // 선생님 등급 분포(S/A/B) + 평점(평균 만족도용)
      this.prisma.teacher_profile.findMany({
        where: centerId ? { center_id: centerId } : {},
        select: { grade: true, rating: true },
      }),
    ]);

    // 주별 매칭 추이(최근 6주): 신청=생성 주, 성사=완료(done, start_at) 주
    const WEEKS = 6;
    const weekMs = 7 * 86_400_000;
    const trendStart = new Date(now.getTime() - WEEKS * weekMs);
    const [createdRows, doneRows] = await Promise.all([
      this.prisma.booking.findMany({
        where: { ...centerWhere, created_at: { gte: trendStart } },
        select: { created_at: true },
      }),
      this.prisma.booking.findMany({
        where: {
          ...centerWhere,
          status: BookingStatus.DONE,
          start_at: { gte: trendStart },
        },
        select: { start_at: true },
      }),
    ]);
    // 미래 start_at(데모/예약 완료 선반영)은 음수 경과 → 인덱스 음수 방지 위해 [0, WEEKS-1] 클램프
    const bucket = (d: Date) =>
      Math.max(
        0,
        Math.min(WEEKS - 1, Math.floor((now.getTime() - d.getTime()) / weekMs)),
      );
    const trend = Array.from({ length: WEEKS }, (_, i) => ({
      weeksAgo: WEEKS - 1 - i,
      applied: 0,
      matched: 0,
    }));
    for (const r of createdRows)
      trend[WEEKS - 1 - bucket(r.created_at)].applied += 1;
    for (const r of doneRows)
      if (r.start_at) trend[WEEKS - 1 - bucket(r.start_at)].matched += 1;

    // 등급별 급여표(센터 정책 → 없으면 전사 공통)
    const policies = await this.prisma.payroll_policy.findMany({
      where: centerId ? { center_id: centerId } : {},
    });
    const pol = policies[0] ?? null;
    const gradeMap =
      (pol?.grade_allowance as Record<string, number> | null) ?? {};
    const gradePayTable = ['S', 'A', 'B'].map((g) => ({
      grade: g,
      perCaseRate: pol?.per_case_rate ?? 30000,
      hourlyRate: pol?.hourly_rate ?? 0,
      gradeAllowance: gradeMap[g] ?? 0,
    }));

    const matchRate =
      totalBookings === 0
        ? 0
        : Math.round((doneTotal / totalBookings) * 1000) / 10;

    const gradeDistribution = { S: 0, A: 0, B: 0 } as Record<string, number>;
    for (const t of teachers) {
      const g = String(t.grade);
      gradeDistribution[g] = (gradeDistribution[g] ?? 0) + 1;
    }
    const ratings = teachers
      .map((t) => (t.rating == null ? null : Number(t.rating)))
      .filter((r): r is number => r != null && r > 0);
    const avgSatisfaction = ratings.length
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) /
        10
      : null;

    return {
      data: {
        centerId: centerId ?? null,
        activeUsers,
        totalBookings,
        doneTotal,
        confirmedUpcoming,
        weeklyConsult,
        matchRate, // 완료/전체 (%)
        avgSatisfaction,
        gradeDistribution,
        teacherCount: teachers.length,
        trend,
        gradePayTable,
      },
      meta: {
        generatedAt: now.toISOString(),
        scope: centerId ? 'center' : 'global',
      },
    };
  }
}
