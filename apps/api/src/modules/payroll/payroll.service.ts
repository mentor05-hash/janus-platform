import {
  BadRequestException,
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
import { CREDIT_WON_RATIO } from '../../config/constants';
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
import { AuditService } from '../audit/audit.service';
import { computeDeductions, computeEmployerContribution, severanceAccrual, computeFreelancer } from './domain/deductions';
import { isFullTime } from '../../common/consult-assignment';

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
    private readonly audit: AuditService,
  ) {}

  async estimate(teacherId: string, actor: AuthUser) {
    const isSelf = actor.role === AccountRole.TEACHER && actor.id === teacherId;
    const isAdmin =
      actor.role === AccountRole.ADMIN || actor.role === AccountRole.HR;
    if (!isSelf && !isAdmin)
      throw new ForbiddenException('급여 조회 권한이 없습니다.');
    return this.compute(teacherId, actor);
  }

  // ── 매출 배분(전임) 급여 — 크레딧 매출 × 배분율(본사) + 4대보험 ──
  private static readonly SHARE_KEY = 'payroll_share_policy';
  private static readonly SHARE_DEFAULT = { sharePct: 60 };

  async getSharePolicy(): Promise<{ sharePct: number }> {
    const row = await this.prisma.system_setting.findUnique({ where: { key: PayrollService.SHARE_KEY } });
    return { ...PayrollService.SHARE_DEFAULT, ...((row?.value as object) ?? {}) };
  }

  async setSharePolicy(actor: AuthUser, dto: { sharePct?: number }) {
    const isHq = actor.role === AccountRole.ADMIN && !actor.centerId;
    if (!isHq) throw new ForbiddenException('배분율은 본사 관리자만 변경할 수 있습니다.');
    if (dto.sharePct !== undefined && (dto.sharePct < 0 || dto.sharePct > 100)) {
      throw new BadRequestException('배분율은 0~100% 범위여야 합니다.');
    }
    const next = { ...(await this.getSharePolicy()), ...dto };
    await this.prisma.system_setting.upsert({
      where: { key: PayrollService.SHARE_KEY },
      create: { key: PayrollService.SHARE_KEY, value: next, updated_by: actor.id },
      update: { value: next, updated_by: actor.id, updated_at: new Date() },
    });
    return next;
  }

  // ── 급여 모델(본사): share=순수배분 · floor=기본급 보장+배분 · base_incentive=기본급+인센티브 ──
  private static readonly MODEL_KEY = 'payroll_model_policy';
  private static readonly MODEL_DEFAULT = { mode: 'share', base: 2_000_000, incentivePct: 30 };

  async getModelPolicy(): Promise<{ mode: string; base: number; incentivePct: number }> {
    const row = await this.prisma.system_setting.findUnique({ where: { key: PayrollService.MODEL_KEY } });
    return { ...PayrollService.MODEL_DEFAULT, ...((row?.value as object) ?? {}) };
  }

  async setModelPolicy(actor: AuthUser, dto: { mode?: string; base?: number; incentivePct?: number }) {
    const isHq = actor.role === AccountRole.ADMIN && !actor.centerId;
    if (!isHq) throw new ForbiddenException('급여 모델은 본사 관리자만 변경할 수 있습니다.');
    if (dto.mode !== undefined && !['share', 'floor', 'base_incentive'].includes(dto.mode)) {
      throw new BadRequestException('mode 는 share | floor | base_incentive 여야 합니다.');
    }
    if (dto.base !== undefined && (dto.base < 0 || dto.base > 20_000_000)) throw new BadRequestException('기본급 범위 오류.');
    if (dto.incentivePct !== undefined && (dto.incentivePct < 0 || dto.incentivePct > 100)) throw new BadRequestException('인센티브율 범위 오류.');
    const next = { ...(await this.getModelPolicy()), ...dto };
    await this.prisma.system_setting.upsert({
      where: { key: PayrollService.MODEL_KEY },
      create: { key: PayrollService.MODEL_KEY, value: next, updated_by: actor.id },
      update: { value: next, updated_by: actor.id, updated_at: new Date() },
    });
    return next;
  }

  /** 급여 모델에 따른 세전 급여 산정. */
  private grossByModel(revenue: number, sharePct: number, model: { mode: string; base: number; incentivePct: number }): number {
    const share = Math.round((revenue * sharePct) / 100);
    if (model.mode === 'floor') return Math.max(model.base, share);                       // 기본급 보장 + 배분
    if (model.mode === 'base_incentive') return model.base + Math.round((revenue * model.incentivePct) / 100); // 기본급 + 인센티브
    return share;                                                                          // 순수 배분
  }

  /** 한 선생님의 기간 매출배분 급여 명세(완료·확정 세션 매출 × 배분율, 4대보험 반영). */
  async revenueSharePayslip(teacherId: string, actor: AuthUser, period?: string) {
    const isSelf = actor.role === AccountRole.TEACHER && actor.id === teacherId;
    const isAdmin = actor.role === AccountRole.ADMIN || actor.role === AccountRole.HR;
    if (!isSelf && !isAdmin) throw new ForbiddenException('명세 조회 권한이 없습니다.');
    const { start, end, label } = this.periodBounds(period);
    const tp = await this.prisma.teacher_profile.findUnique({
      where: { account_id: teacherId },
      include: { account: { select: { name: true } }, center: { select: { name: true } } },
    });
    if (!tp) throw new NotFoundException('선생님을 찾을 수 없습니다.');
    const { sharePct } = await this.getSharePolicy();
    const model = await this.getModelPolicy();
    const agg = await this.prisma.booking.aggregate({
      where: { teacher_id: teacherId, status: { in: [BookingStatus.CONFIRMED, BookingStatus.DONE] }, start_at: { gte: start, lte: end } },
      _sum: { charged_credits: true }, _count: { _all: true },
    });
    // 크레딧 매출 → 원 환산(1크=0.5원, O1). 배분·명세는 원 기준.
    const creditRevenue = agg._sum.charged_credits ?? 0;
    const revenue = Math.round(creditRevenue * CREDIT_WON_RATIO);
    const sessions = agg._count._all;
    const gross = this.grossByModel(revenue, sharePct, model);
    const deductions = computeDeductions(gross);
    const employer = computeEmployerContribution(gross);
    const severance = severanceAccrual(gross);          // 퇴직금 적립(전임만)
    const totalCost = gross + employer.total + severance; // 회사 총부담(4대보험+퇴직금 포함)
    // 같은 배분액을 프리랜서(사업소득 3.3%)로 지급했을 때 비교
    const freelancer = computeFreelancer(gross);
    const fullTimePremium = totalCost - gross;           // 전임 추가비용(사업주보험+퇴직금)
    return {
      period: label,
      teacherId,
      teacherName: tp.account.name,
      center: tp.center?.name ?? '-',
      fullTime: isFullTime(tp.employment_type),
      sessions,
      creditRevenue,        // 크레딧 매출(크레딧 단위)
      revenue,              // 원 매출(= creditRevenue × 0.5)
      sharePct,
      model,                // 급여 모델(share/floor/base_incentive)
      gross,                // 세전 급여(모델 반영)
      deductions,           // 근로자 4대보험 + 소득세/지방세 + net
      net: deductions.net,  // 전임 실수령
      employer,             // 사업주 4대보험
      severance,            // 퇴직금 적립(월)
      totalCost,            // 회사 총부담(급여+사업주보험+퇴직금)
      laborRatioPct: revenue > 0 ? Math.round((totalCost / revenue) * 1000) / 10 : 0,
      freelancer: {         // 동일 배분액을 프리랜서로 지급 시
        companyCost: gross,           // 회사 부담 = 지급액(추가부담 0)
        net: freelancer.net,          // 프리랜서 실수령(3.3% 원천징수 후)
        withholding: freelancer.withholding,
        savingVsFullTime: fullTimePremium, // 전임 대비 회사 절감액(=전임 추가비용)
      },
    };
  }

  /** 관리자: 스코프 내 전임 전원의 매출배분 급여 요약(합계 포함). */
  async revenueShareList(actor: AuthUser, period?: string) {
    if (actor.role !== AccountRole.ADMIN && actor.role !== AccountRole.HR) {
      throw new ForbiddenException('관리자만 조회할 수 있습니다.');
    }
    const centerId = actor.centerId ?? null;
    const teachers = await this.prisma.teacher_profile.findMany({
      where: { employment_type: '전임', ...(centerId ? { center_id: centerId } : {}) },
      select: { account_id: true },
    });
    const rows: Array<{ teacherId: string; name: string; center: string; sessions: number; revenue: number; gross: number; net: number; totalCost: number; freelancerCost: number; premium: number }> = [];
    for (const t of teachers) {
      const p = await this.revenueSharePayslip(t.account_id, actor, period);
      rows.push({
        teacherId: p.teacherId, name: p.teacherName, center: p.center, sessions: p.sessions,
        revenue: p.revenue, gross: p.gross, net: p.net, totalCost: p.totalCost,
        freelancerCost: p.freelancer.companyCost, premium: p.freelancer.savingVsFullTime,
      });
    }
    rows.sort((a, b) => b.gross - a.gross);
    const sum = (k: 'revenue' | 'gross' | 'net' | 'totalCost' | 'freelancerCost' | 'premium') => rows.reduce((a, r) => a + r[k], 0);
    const { sharePct } = await this.getSharePolicy();
    const model = await this.getModelPolicy();
    return {
      period: this.periodBounds(period).label,
      sharePct,
      model,
      count: rows.length,
      totals: { revenue: sum('revenue'), gross: sum('gross'), net: sum('net'), totalCost: sum('totalCost'), freelancerCost: sum('freelancerCost'), premium: sum('premium') },
      rows,
    };
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
    const deductions = computeDeductions(est.confirmedAmount);
    const data = {
      cycle: 'monthly',
      confirmed_amount: est.confirmedAmount,
      expected_amount: est.expectedAmount,
      breakdown: est.breakdown as object,
      status: 'confirmed',
      deductions: deductions as object,
      net_amount: deductions.net,
      settled_by: actor.id,
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
    await this.audit.record(actor, {
      action: 'payroll.settle', targetType: 'teacher', targetId: teacherId,
      summary: `급여 정산 확정(실지급 ${deductions.net.toLocaleString()}원 · 공제 ${deductions.total.toLocaleString()}원)`,
      meta: { gross: est.confirmedAmount, net: deductions.net, period: periodStart.toISOString().slice(0, 7) },
    });
    return { id: row.id, status: 'confirmed', deductions, netAmount: deductions.net, ...est };
  }

  private periodBounds(period?: string, now = new Date()) {
    const y = period ? Number(period.slice(0, 4)) : now.getUTCFullYear();
    const m = period ? Number(period.slice(5, 7)) - 1 : now.getUTCMonth();
    return {
      start: new Date(Date.UTC(y, m, 1)),
      end: new Date(Date.UTC(y, m + 1, 0)),
      label: `${y}-${String(m + 1).padStart(2, '0')}`,
    };
  }

  /** 지급완료 처리(관리자/HR) — 확정 정산을 실지급 상태로 전환(가상 이체). */
  async markPaid(teacherId: string, actor: AuthUser, period?: string) {
    if (actor.role !== AccountRole.ADMIN && actor.role !== AccountRole.HR) {
      throw new ForbiddenException('관리자만 지급 처리를 할 수 있습니다.');
    }
    const { start } = this.periodBounds(period);
    const row = await this.prisma.payroll_estimate.findFirst({
      where: { teacher_id: teacherId, cycle: 'monthly', period_start: start },
    });
    if (!row) throw new NotFoundException('먼저 정산을 확정하세요.');
    if (row.status === 'paid') throw new BadRequestException('이미 지급 완료된 정산입니다.');
    const updated = await this.prisma.payroll_estimate.update({
      where: { id: row.id },
      data: { status: 'paid', paid_at: new Date() },
    });
    await this.audit.record(actor, {
      action: 'payroll.pay', targetType: 'teacher', targetId: teacherId,
      summary: `급여 지급 완료(실지급 ${(row.net_amount ?? 0).toLocaleString()}원)`,
      meta: { net: row.net_amount, period: this.periodBounds(period).label },
    });
    return { id: updated.id, status: updated.status, paidAt: updated.paid_at };
  }

  /** 재무 정산 리포트(관리자/HR) — 기간 확정/지급 집계 + 공제 합계 + 센터별. */
  async financeReport(actor: AuthUser, period?: string) {
    if (actor.role !== AccountRole.ADMIN && actor.role !== AccountRole.HR) {
      throw new ForbiddenException('관리자만 재무 리포트를 볼 수 있습니다.');
    }
    const { start, label } = this.periodBounds(period);
    const rows = await this.prisma.payroll_estimate.findMany({
      where: { cycle: 'monthly', period_start: start, status: { in: ['confirmed', 'paid'] } },
      include: { teacher_profile: { include: { account: { select: { name: true, center_id: true } }, center: { select: { name: true } } } } },
    });
    // HQ(센터 미소속)는 전사, 그 외는 자기 센터만
    const isHq = actor.role === AccountRole.ADMIN && !actor.centerId;
    const scoped = rows.filter((r) => isHq || r.teacher_profile.account.center_id === actor.centerId);
    const sum = (f: (r: (typeof scoped)[number]) => number) => scoped.reduce((a, r) => a + f(r), 0);
    const ded = (r: (typeof scoped)[number], k: string) => Number((r.deductions as Record<string, number> | null)?.[k] ?? 0);
    const byCenter = new Map<string, { center: string; count: number; gross: number; net: number; paid: number }>();
    for (const r of scoped) {
      const c = r.teacher_profile.center?.name ?? '(미지정)';
      const e = byCenter.get(c) ?? { center: c, count: 0, gross: 0, net: 0, paid: 0 };
      e.count += 1; e.gross += r.confirmed_amount ?? 0; e.net += r.net_amount ?? 0;
      if (r.status === 'paid') e.paid += r.net_amount ?? 0;
      byCenter.set(c, e);
    }
    return {
      period: label,
      headcount: scoped.length,
      gross: sum((r) => r.confirmed_amount ?? 0),
      net: sum((r) => r.net_amount ?? 0),
      paid: scoped.filter((r) => r.status === 'paid').reduce((a, r) => a + (r.net_amount ?? 0), 0),
      pending: scoped.filter((r) => r.status !== 'paid').reduce((a, r) => a + (r.net_amount ?? 0), 0),
      deductions: {
        국민연금: sum((r) => ded(r, '국민연금')), 건강보험: sum((r) => ded(r, '건강보험')),
        장기요양: sum((r) => ded(r, '장기요양')), 고용보험: sum((r) => ded(r, '고용보험')),
        소득세: sum((r) => ded(r, '소득세')), 지방소득세: sum((r) => ded(r, '지방소득세')),
        total: sum((r) => Number((r.deductions as Record<string, number> | null)?.total ?? 0)),
      },
      byCenter: [...byCenter.values()].sort((a, b) => b.net - a.net),
      rows: scoped.map((r) => ({
        teacherId: r.teacher_id, name: r.teacher_profile.account.name,
        center: r.teacher_profile.center?.name ?? '-',
        gross: r.confirmed_amount ?? 0, net: r.net_amount ?? 0, status: r.status,
      })).sort((a, b) => b.net - a.net),
    };
  }

  /** 명세서 데이터(본인 또는 관리자) — 인쇄·PDF 저장용. */
  async payslip(teacherId: string, actor: AuthUser, period?: string) {
    const isSelf = actor.role === AccountRole.TEACHER && actor.id === teacherId;
    const isAdmin = actor.role === AccountRole.ADMIN || actor.role === AccountRole.HR;
    if (!isSelf && !isAdmin) throw new ForbiddenException('명세서 조회 권한이 없습니다.');
    const { start, label } = this.periodBounds(period);
    const row = await this.prisma.payroll_estimate.findFirst({
      where: { teacher_id: teacherId, cycle: 'monthly', period_start: start },
      include: { teacher_profile: { include: { account: { select: { name: true } }, center: { select: { name: true } } } } },
    });
    if (!row) throw new NotFoundException('해당 기간 확정 정산이 없습니다.');
    return {
      period: label,
      teacherName: row.teacher_profile.account.name,
      center: row.teacher_profile.center?.name ?? '-',
      status: row.status,
      paidAt: row.paid_at,
      gross: row.confirmed_amount ?? 0,
      deductions: row.deductions,
      net: row.net_amount ?? 0,
      breakdown: row.breakdown,
    };
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
    const rates = this.resolveRates(policy, teacher.grade, {
      perCaseRate: teacher.per_case_rate,
      hourlyRate: teacher.hourly_rate,
      basePay: teacher.pay_base,
    });
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
        basePay: rates.basePay ?? 0,
        employmentType: teacher.employment_type ?? null,
      },
      gradeTable: gradeMap ?? {},
    };
  }

  /**
   * 단가 결정 우선순위: 근무자별 지정(teacher) → payroll_policy → ENV.
   * 기본급(basePay)은 근무자별 pay_base(고정 월 기본급).
   */
  private resolveRates(
    policy: {
      per_case_rate: number | null;
      qna_rate: number | null;
      grade_allowance: unknown;
      hourly_rate?: number | null;
      auto_incentive?: unknown;
    } | null,
    grade: string,
    teacher?: { perCaseRate?: number | null; hourlyRate?: number | null; basePay?: number | null },
  ): PayrollRates {
    const envNum = (key: string, fallback: number) =>
      Number(this.config.get(key) ?? fallback);
    const gradeMap =
      (policy?.grade_allowance as Record<string, number> | null) ?? null;
    const ai = (policy?.auto_incentive as { staleBonus?: number } | null) ?? null;
    return {
      perCaseRate:
        teacher?.perCaseRate ?? policy?.per_case_rate ?? envNum('PAYROLL_PER_CASE_RATE', 30_000),
      qnaRate: policy?.qna_rate ?? envNum('PAYROLL_QNA_RATE', 5_000),
      gradeAllowance: gradeMap?.[grade] ?? envNum('PAYROLL_GRADE_ALLOWANCE', 0),
      hourlyRate: teacher?.hourlyRate ?? policy?.hourly_rate ?? envNum('PAYROLL_HOURLY_RATE', 0),
      staleAnswerBonus: ai?.staleBonus ?? envNum('PAYROLL_STALE_BONUS', 0),
      basePay: teacher?.basePay ?? 0,
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
