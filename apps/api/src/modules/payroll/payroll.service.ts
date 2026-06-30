import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole, BookingStatus } from '../../config/enums';
import {
  computeIncentive,
  computePayroll,
  IncentivePolicy,
  PayrollRates,
} from './domain/payroll';

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

    const [doneCount, upcomingCount, qnaAcceptedCount] = await Promise.all([
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
    ]);

    const policy = await this.prisma.payroll_policy.findFirst({
      where: {
        center_id: teacher.center_id,
        ...(teacher.teacher_category
          ? { teacher_category: teacher.teacher_category }
          : {}),
      },
    });
    const rates = this.resolveRates(policy, teacher.grade);
    const base = computePayroll(
      { doneCount, upcomingCount, qnaAcceptedCount },
      rates,
    );

    const rating = teacher.rating == null ? 0 : Number(teacher.rating);
    const incentive = computeIncentive(
      { doneCount, rating },
      (policy?.auto_incentive as unknown as IncentivePolicy) ?? null,
    );

    return {
      teacherId,
      confirmedAmount: base.confirmedAmount + incentive,
      expectedAmount: base.expectedAmount + incentive,
      incentive,
      breakdown: { ...base.breakdown, incentive },
    };
  }

  /** payroll_policy 우선(등급 수당은 grade_allowance 맵에서 교사 등급으로 조회), 없으면 ENV. */
  private resolveRates(
    policy: {
      per_case_rate: number | null;
      qna_rate: number | null;
      grade_allowance: unknown;
    } | null,
    grade: string,
  ): PayrollRates {
    const envNum = (key: string, fallback: number) =>
      Number(this.config.get(key) ?? fallback);
    const gradeMap =
      (policy?.grade_allowance as Record<string, number> | null) ?? null;
    return {
      perCaseRate:
        policy?.per_case_rate ?? envNum('PAYROLL_PER_CASE_RATE', 30_000),
      qnaRate: policy?.qna_rate ?? envNum('PAYROLL_QNA_RATE', 5_000),
      gradeAllowance: gradeMap?.[grade] ?? envNum('PAYROLL_GRADE_ALLOWANCE', 0),
    };
  }
}
