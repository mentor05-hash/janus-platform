import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  hhmmToMin,
  kstDateString,
  weekdayKst,
} from '../../common/time/kst';
import { AccountRole, BookingStatus } from '../../config/enums';
import {
  mondayOf,
  WeeklyTemplate,
  WeekPlan,
} from '../availability/availability.service';
import {
  computeIncentive,
  computePayroll,
  IncentivePolicy,
  PayrollRates,
} from './domain/payroll';

const STALE_ANSWER_HOURS = 48; // 48시간 미답 → 답변 보상 기준(T5c)

/**
 * 급여 정산 (CLAUDE.md §payroll, §3.4).
 * 확정분(완료)+예상분(예정)+Q&A 적격(pay_eligible)+자동 인센티브. 단가/조건은 정책 또는 ENV(O20).
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async estimate(teacherId: string, actor: AuthUser) {
    const isSelf = actor.role === AccountRole.TEACHER && actor.id === teacherId;
    const isAdmin =
      actor.role === AccountRole.ADMIN || actor.role === AccountRole.HR;
    if (!isSelf && !isAdmin)
      throw new ForbiddenException('급여 조회 권한이 없습니다.');
    return this.compute(teacherId, actor);
  }

  /** 확정 정산: 산정 결과를 payroll_estimate 에 기록(관리자/HR). */
  async settle(teacherId: string, actor: AuthUser, now = new Date()) {
    if (actor.role !== AccountRole.ADMIN && actor.role !== AccountRole.HR) {
      throw new ForbiddenException('관리자만 정산을 확정할 수 있습니다.');
    }
    const est = await this.compute(teacherId, actor);
    const periodStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const periodEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    );
    const data = {
      cycle: 'monthly',
      confirmed_amount: est.confirmedAmount,
      expected_amount: est.expectedAmount,
      breakdown: est.breakdown as object,
      period_start: periodStart,
      period_end: periodEnd,
    };
    // 멱등: 같은 교사·기간 정산은 갱신(중복 행 방지)
    const existing = await this.prisma.payroll_estimate.findFirst({
      where: {
        teacher_id: teacherId,
        cycle: 'monthly',
        period_start: periodStart,
      },
    });
    const row = existing
      ? await this.prisma.payroll_estimate.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.payroll_estimate.create({
          data: { teacher_id: teacherId, ...data },
        });
    return { id: row.id, ...est };
  }

  private async compute(teacherId: string, actor: AuthUser) {
    const teacher = await this.prisma.teacher_profile.findUnique({
      where: { account_id: teacherId },
    });
    if (!teacher) throw new NotFoundException('선생님을 찾을 수 없습니다.');
    // 관리자/HR 은 자기 센터 교사만(타 센터 급여 열람·정산 방지, S4)
    const isAdmin =
      actor.role === AccountRole.ADMIN || actor.role === AccountRole.HR;
    if (isAdmin && actor.centerId && teacher.center_id !== actor.centerId) {
      throw new ForbiddenException(
        '다른 센터 교사의 급여는 조회/정산할 수 없습니다.',
      );
    }

    const [doneCount, upcomingCount, qnaAcceptedCount, ws, staleAnswers] =
      await Promise.all([
        this.prisma.booking.count({
          where: { teacher_id: teacherId, status: BookingStatus.DONE },
        }),
        this.prisma.booking.count({
          where: { teacher_id: teacherId, status: BookingStatus.CONFIRMED },
        }),
        // 채택되어 급여 적격(pay_eligible)인 Q&A 답변만 합산(§3.1 연동)
        this.prisma.qna_answer.count({
          where: { teacher_id: teacherId, pay_eligible: true },
        }),
        // 근무시간 산정용 스케줄(T5b)
        this.prisma.work_schedule.findFirst({ where: { teacher_id: teacherId } }),
        // 48h 미답 보상 대상(T5c): 채택된 답변 중 질문 등록 48h 경과 후 답변한 건
        this.prisma.qna_answer.findMany({
          where: { teacher_id: teacherId, pay_eligible: true },
          select: { created_at: true, qna_post: { select: { created_at: true } } },
          take: 500,
        }),
      ]);

    const workMinutes = this.monthWorkMinutes(ws);
    const staleAnswerCount = staleAnswers.filter(
      (a) =>
        a.qna_post &&
        a.created_at.getTime() - a.qna_post.created_at.getTime() >
          STALE_ANSWER_HOURS * 3_600_000,
    ).length;

    // 카테고리별 정책 우선, 없으면 센터 공통(teacher_category=null) 정책으로 폴백.
    const policies = await this.prisma.payroll_policy.findMany({
      where: { center_id: teacher.center_id },
    });
    const policy =
      policies.find((p) => p.teacher_category === teacher.teacher_category) ??
      policies.find((p) => !p.teacher_category) ??
      null;
    const rates = this.resolveRates(policy, teacher.grade);
    const base = computePayroll(
      {
        doneCount,
        upcomingCount,
        qnaAcceptedCount,
        workMinutes,
        staleAnswerCount,
      },
      rates,
    );

    const rating = teacher.rating == null ? 0 : Number(teacher.rating);
    const autoIncentive =
      (policy?.auto_incentive as unknown as IncentivePolicy) ?? null;
    const incentive = computeIncentive({ doneCount, rating }, autoIncentive);

    const gradeMap =
      (policy?.grade_allowance as Record<string, number> | null) ?? null;

    return {
      teacherId,
      grade: teacher.grade,
      confirmedAmount: base.confirmedAmount + incentive,
      expectedAmount: base.expectedAmount + incentive,
      incentive,
      incentiveOn: !!autoIncentive?.on,
      breakdown: { ...base.breakdown, incentive },
      // 등급별 급여표(T5d) — 정책의 등급 수당 맵 + 공통 요율.
      rates: {
        perCaseRate: rates.perCaseRate,
        qnaRate: rates.qnaRate,
        hourlyRate: rates.hourlyRate,
        staleAnswerBonus: rates.staleAnswerBonus,
      },
      gradeTable: gradeMap ?? {},
    };
  }

  /** payroll_policy 우선(등급 수당은 grade_allowance 맵에서 교사 등급으로 조회), 없으면 ENV. */
  private resolveRates(
    policy: {
      per_case_rate: number | null;
      qna_rate: number | null;
      grade_allowance: unknown;
      hourly_rate?: number | null;
      auto_incentive?: unknown;
    } | null,
    grade: string,
  ): PayrollRates {
    const envNum = (key: string, fallback: number) =>
      Number(this.config.get(key) ?? fallback);
    const gradeMap =
      (policy?.grade_allowance as Record<string, number> | null) ?? null;
    const ai = (policy?.auto_incentive as { staleBonus?: number } | null) ?? null;
    return {
      perCaseRate:
        policy?.per_case_rate ?? envNum('PAYROLL_PER_CASE_RATE', 30_000),
      qnaRate: policy?.qna_rate ?? envNum('PAYROLL_QNA_RATE', 5_000),
      gradeAllowance: gradeMap?.[grade] ?? envNum('PAYROLL_GRADE_ALLOWANCE', 0),
      hourlyRate: policy?.hourly_rate ?? envNum('PAYROLL_HOURLY_RATE', 0),
      staleAnswerBonus: ai?.staleBonus ?? envNum('PAYROLL_STALE_BONUS', 0),
    };
  }

  /** 이번 달(KST) 예정 근무 분 합계 — 주계획 override 반영, 시급 급여(T5b) 산정용. */
  private monthWorkMinutes(
    ws: { recurring_template: unknown; week_plans: unknown } | null,
    now = new Date(),
  ): number {
    if (!ws) return 0;
    const recurring = (ws.recurring_template as WeeklyTemplate) ?? {};
    const plans: WeekPlan[] = Array.isArray(ws.week_plans)
      ? (ws.week_plans as WeekPlan[]).filter((p) => p && p.weekStart && p.template)
      : [];
    const ym = kstDateString(now).slice(0, 7); // 'YYYY-MM'
    const [y, m] = ym.split('-').map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let total = 0;
    for (let d = 1; d <= days; d++) {
      const dateStr = `${ym}-${String(d).padStart(2, '0')}`;
      const plan = plans.find((p) => p.weekStart === mondayOf(dateStr));
      const tpl: WeeklyTemplate = plan
        ? { ...recurring, ...plan.template }
        : recurring;
      const wins = tpl[String(weekdayKst(dateStr))] ?? [];
      for (const w of wins) total += Math.max(0, hhmmToMin(w.end) - hhmmToMin(w.start));
    }
    return total;
  }
}
