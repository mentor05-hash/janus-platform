import {
  BadRequestException,
  ForbiddenException,
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

  /** 회원 등급 편집(HR): 주간 부여 크레딧·활성. 학생 화면이 이 값을 읽는다. */
  async updateGrade(
    id: string,
    dto: { weeklyCredits?: number; active?: boolean },
  ) {
    const grade = await this.prisma.membership_grade.findUnique({
      where: { id },
    });
    if (!grade) throw new NotFoundException('회원 등급을 찾을 수 없습니다.');
    return this.prisma.membership_grade.update({
      where: { id },
      data: {
        ...(dto.weeklyCredits != null ? { weekly_credits: dto.weeklyCredits } : {}),
        ...(dto.active != null ? { active: dto.active } : {}),
      },
    });
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

  // ── 학부모 업셀 홍보 문구(본사 관리자 편집) ──────────────────
  private static readonly PROMO_KEY = 'membership_promo';
  private static readonly PROMO_DEFAULT = {
    headline: '자녀 학습, 한 단계 더',
    subcopy: '상위 멤버십으로 매주 더 많은 상담 크레딧과 우선 배정을 받아보세요.',
    highlightPlanId: null as string | null,
  };

  /** 홍보 문구 조회(기본값=코드값, 본사 편집 시 override). */
  async getPromo() {
    const row = await this.prisma.system_setting.findUnique({ where: { key: MembershipService.PROMO_KEY } });
    return { ...MembershipService.PROMO_DEFAULT, ...((row?.value as object) ?? {}) };
  }

  /** 홍보 문구 변경(본사 관리자). */
  async setPromo(actor: AuthUser, dto: { headline?: string; subcopy?: string; highlightPlanId?: string | null }) {
    const isHq = actor.role === 'admin' && !actor.centerId;
    if (!isHq) throw new ForbiddenException('홍보 문구는 본사 관리자만 변경할 수 있습니다.');
    const next = { ...(await this.getPromo()), ...dto };
    await this.prisma.system_setting.upsert({
      where: { key: MembershipService.PROMO_KEY },
      create: { key: MembershipService.PROMO_KEY, value: next, updated_by: actor.id },
      update: { value: next, updated_by: actor.id, updated_at: new Date() },
    });
    return next;
  }

  async mySubscription(student: AuthUser) {
    return this.prisma.student_subscription.findFirst({
      where: { student_id: student.id, status: 'active' },
      orderBy: { started_at: 'desc' },
    });
  }

  /** 학생이 플랜 구독 → 등급 반영. 기존 활성 구독은 비활성화(중복 방지). */
  /** 학생 본인 구독. */
  async subscribe(student: AuthUser, planId: string, now = new Date()) {
    return this.doSubscribe(student.id, planId, now);
  }

  /**
   * 학부모가 자녀 대신 구독 개시(업셀). 승인된 연결 자녀만 허용.
   * 결제(정기결제)는 플랜 payer 정책(기본 guardian)에 따라 autopay 가 보호자 계좌로 청구.
   */
  async subscribeForChild(guardian: AuthUser, studentId: string, planId: string, now = new Date()) {
    const link = await this.prisma.guardian_student_link.findFirst({
      where: { guardian_id: guardian.id, student_id: studentId, status: 'approved' },
    });
    if (!link) throw new ForbiddenException('연결된 자녀가 아닙니다.');
    return this.doSubscribe(studentId, planId, now);
  }

  /** 구독 개시 공통 로직(학생ID 기준). */
  private async doSubscribe(studentId: string, planId: string, now: Date) {
    const plan = await this.prisma.subscription_plan.findUnique({
      where: { id: planId },
    });
    if (!plan) throw new NotFoundException('구독 플랜을 찾을 수 없습니다.');
    if (!plan.grade_id)
      throw new BadRequestException('플랜에 등급이 연결되어 있지 않습니다.');

    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: studentId },
    });
    if (!sp) throw new NotFoundException('학생 프로필이 없습니다.');

    const nextBilling = computeNextBilling(plan.billing_cycle, now);

    return this.prisma.$transaction(async (tx) => {
      // 기존 활성 구독 비활성화
      await tx.student_subscription.updateMany({
        where: { student_id: studentId, status: 'active' },
        data: { status: 'inactive' },
      });
      const sub = await tx.student_subscription.create({
        data: {
          student_id: studentId,
          plan_id: planId,
          status: 'active',
          next_billing_at: nextBilling,
        },
      });
      // 등급·활성 구독 반영(주간부여가 이 등급을 사용)
      await tx.student_profile.update({
        where: { account_id: studentId },
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
