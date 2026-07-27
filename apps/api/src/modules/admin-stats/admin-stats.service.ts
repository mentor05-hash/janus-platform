import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/** 관리자 통계 — 진단·강좌·커뮤니티 핵심 지표(운영 대시보드용). */
@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [
      diagAttempts, diagAgg, diagStudents,
      lectureCount, enrollCount,
      commPosts, commAnswers, commAccepted, leaguePromoted,
    ] = await Promise.all([
      this.prisma.diagnostic_attempt.count({ where: { submitted_at: { not: null } } }),
      this.prisma.diagnostic_attempt.aggregate({ where: { submitted_at: { not: null } }, _avg: { score: true } }),
      this.prisma.diagnostic_attempt.findMany({ where: { submitted_at: { not: null } }, distinct: ['student_id'], select: { student_id: true } }),
      this.prisma.lecture.count({ where: { active: true } }),
      this.prisma.lecture_enrollment.count(),
      this.prisma.qna_post.count({ where: { community: true } }),
      this.prisma.qna_community_answer.count(),
      this.prisma.qna_community_answer.count({ where: { accepted: true } }),
      this.prisma.qna_league.count({ where: { tier: { lt: 3 } } }),
    ]);

    return {
      diagnostic: {
        attempts: diagAttempts,
        avgScore: Math.round(diagAgg._avg.score ?? 0),
        students: diagStudents.length,
      },
      lecture: {
        active: lectureCount,
        enrollments: enrollCount,
      },
      community: {
        posts: commPosts,
        answers: commAnswers,
        accepted: commAccepted,
        acceptRate: commAnswers ? Math.round((commAccepted / commAnswers) * 100) : 0,
        leaguePromoted,
      },
    };
  }
}
