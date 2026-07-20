import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { AccountRole } from '../../config/enums';
import { TUTOR_SOURCE_PAGE, tutorSourceOf, type TutorSource } from './tutor-source';

/**
 * tutor_source 파생 지표 — 상근(salaried) 도입 전후 비교 근거(도입 기획서 §4.5).
 * 완주·재결제는 funnel_event 스냅샷(page='tutor_source'), 정산액은 payroll_estimate.tutor_source 스냅샷을 집계.
 * 정산 계산에는 개입하지 않는다(읽기 전용 관측).
 */
@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 이벤트 시점 고용유형 조회(스냅샷 태깅용). */
  async resolveTutorSource(teacherId: string): Promise<TutorSource> {
    const p = await this.prisma.teacher_profile.findUnique({ where: { account_id: teacherId }, select: { employment_type: true } });
    return tutorSourceOf(p?.employment_type ?? null);
  }

  private assertStaff(user: AuthUser) {
    if (user.role !== AccountRole.ADMIN && user.role !== AccountRole.HR) throw new ForbiddenException('관리자만 조회할 수 있습니다.');
  }

  /** 파생 지표: tutor_source별 완주 수·재결제 수·정산합·세션수 → 완주율·재결제율·건당정산액. */
  async tutorSource(user: AuthUser, days = 90) {
    this.assertStaff(user);
    const since = new Date(Date.now() - Math.min(Math.max(days, 1), 365) * 86_400_000);
    const sources: TutorSource[] = ['freelance', 'salaried'];

    // 완주·재결제 스냅샷(funnel_event.meta.tutorSource).
    const ev = await this.prisma.$queryRaw<Array<{ source: string; event: string; n: number }>>`
      SELECT COALESCE(meta->>'tutorSource', 'freelance') AS source, event, count(*)::int AS n
      FROM funnel_event
      WHERE page = ${TUTOR_SOURCE_PAGE} AND created_at >= ${since}
      GROUP BY 1, 2`;
    const evCount = (src: string, event: string) => ev.find((r) => r.source === src && r.event === event)?.n ?? 0;

    // 예약 수(완주율 분모) — 완주 스냅샷과 같은 창의 booking 기준(teacher 고용유형 현재값으로 근사: baseline 단계).
    // 정산액 스냅샷은 payroll_estimate.tutor_source.
    const settle = await this.prisma.$queryRaw<Array<{ source: string; amount: number; n: number }>>`
      SELECT COALESCE(tutor_source, 'freelance') AS source, COALESCE(sum(confirmed_amount), 0)::int AS amount, count(*)::int AS n
      FROM payroll_estimate
      WHERE tutor_source IS NOT NULL
      GROUP BY 1`;
    const settleOf = (src: string) => settle.find((r) => r.source === src) ?? { amount: 0, n: 0 };

    return {
      days,
      bySource: sources.map((s) => {
        const completed = evCount(s, 'completed');
        const repurchase = evCount(s, 'repurchase');
        const st = settleOf(s);
        return {
          tutorSource: s,
          completed,
          repurchase,
          repurchaseRate: completed > 0 ? Math.round((repurchase / completed) * 1000) / 10 : null,
          settleAmount: st.amount,
          settleSessions: st.n,
          amountPerSession: st.n > 0 ? Math.round(st.amount / st.n) : null,
        };
      }),
      note: '완주율 분모(예약 수)·만족도는 후속(§6). 현재 전원 freelance — 첫 salaried 채용 시 자동 분기.',
    };
  }
}
