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

    const [activeUsers, totalBookings, doneTotal, weeklyConsult, confirmedUpcoming] = await Promise.all([
      this.prisma.account.count({ where: { status: 'approved', ...(centerId ? { center_id: centerId } : {}) } }),
      this.prisma.booking.count({ where: centerWhere }),
      this.prisma.booking.count({ where: { ...centerWhere, status: BookingStatus.DONE } }),
      this.prisma.booking.count({ where: { ...centerWhere, status: BookingStatus.DONE, start_at: { gte: weekAgo } } }),
      this.prisma.booking.count({ where: { ...centerWhere, status: BookingStatus.CONFIRMED } }),
    ]);

    const matchRate = totalBookings === 0 ? 0 : Math.round((doneTotal / totalBookings) * 1000) / 10;

    return {
      data: {
        centerId: centerId ?? null,
        activeUsers,
        totalBookings,
        doneTotal,
        confirmedUpcoming,
        weeklyConsult,
        matchRate, // 완료/전체 (%)
      },
      meta: { generatedAt: now.toISOString(), scope: centerId ? 'center' : 'global' },
    };
  }
}
