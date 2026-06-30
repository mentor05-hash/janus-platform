import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingCycle } from '../../config/enums';
import { computeNextBilling } from './domain/billing-cycle';

/**
 * 회원 등급·구독 (CLAUDE.md §membership, §5-3).
 * 구독 가입 시 학생 등급(membership_grade_id)을 플랜의 등급으로 설정 →
 * 주간부여(WeeklyGrantService)가 등급별 부여량을 적용한다.
 */
@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  listGrades() {
    return this.prisma.membership_grade.findMany({ orderBy: { tier: 'asc' } });
  }

  listPlans() {
    return this.prisma.subscription_plan.findMany({
      include: {
        membership_grade: {
          select: { name: true, weekly_credits: true, tier: true },
        },
      },
    });
  }

  async mySubscription(student: AuthUser) {
    return this.prisma.student_subscription.findFirst({
      where: { student_id: student.id, status: 'active' },
      orderBy: { started_at: 'desc' },
    });
  }

  /** 학생이 플랜 구독 → 등급 반영. 기존 활성 구독은 비활성화(중복 방지). */
  async subscribe(student: AuthUser, planId: string, now = new Date()) {
    const plan = await this.prisma.subscription_plan.findUnique({
      where: { id: planId },
    });
    if (!plan) throw new NotFoundException('구독 플랜을 찾을 수 없습니다.');
    if (!plan.grade_id)
      throw new BadRequestException('플랜에 등급이 연결되어 있지 않습니다.');

    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: student.id },
    });
    if (!sp) throw new NotFoundException('학생 프로필이 없습니다.');

    const nextBilling = computeNextBilling(plan.billing_cycle, now);

    return this.prisma.$transaction(async (tx) => {
      // 기존 활성 구독 비활성화
      await tx.student_subscription.updateMany({
        where: { student_id: student.id, status: 'active' },
        data: { status: 'inactive' },
      });
      const sub = await tx.student_subscription.create({
        data: {
          student_id: student.id,
          plan_id: planId,
          status: 'active',
          next_billing_at: nextBilling,
        },
      });
      // 등급·활성 구독 반영(주간부여가 이 등급을 사용)
      await tx.student_profile.update({
        where: { account_id: student.id },
        data: {
          membership_grade_id: plan.grade_id,
          active_subscription_id: sub.id,
        },
      });
      return {
        subscriptionId: sub.id,
        planId,
        gradeId: plan.grade_id,
        nextBillingAt: nextBilling,
      };
    });
  }
}
