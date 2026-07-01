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
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
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
      },
      meta: {
        generatedAt: now.toISOString(),
        scope: centerId ? 'center' : 'global',
      },
    };
  }
}
