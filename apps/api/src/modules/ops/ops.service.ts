import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CREDIT_WON_RATIO } from '../../config/constants';
import { BookingStatus } from '../../config/enums';

/**
 * 운영 통계 대시보드 (CLAUDE.md §ops). 관리자/HR 권한. 응답 {data, meta} 규약.
 */
@Injectable()
export class OpsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 운영 정책 설정 — SQL 없이 화면에서 조정(본사 마스터). 기본값은 각 서비스 상수와 동일 유지. ──
  private static readonly OPS_KEYS: Record<string, {
    label: string; defaults: unknown; validate: (v: unknown) => string | null;
  }> = {
    chat_session: {
      label: '채팅형 상담 유예 정책 (O94·O95)',
      defaults: { lockAfterDays: 3, postFreeMsgs: 5 },
      validate: (v) => {
        const o = v as { lockAfterDays?: unknown; postFreeMsgs?: unknown };
        if (typeof o?.lockAfterDays !== 'number' || !Number.isInteger(o.lockAfterDays) || o.lockAfterDays < 0 || o.lockAfterDays > 30) return 'lockAfterDays 는 0~30 정수(0=무기한)';
        if (typeof o?.postFreeMsgs !== 'number' || !Number.isInteger(o.postFreeMsgs) || o.postFreeMsgs < 0 || o.postFreeMsgs > 50) return 'postFreeMsgs 는 0~50 정수(0=무제한)';
        return null;
      },
    },
    qa_free_quota: {
      label: '주간 무료 질문권 (P1)',
      defaults: { premiumWeekly: 3, defaultWeekly: 0 },
      validate: (v) => {
        const o = v as { premiumWeekly?: unknown; defaultWeekly?: unknown };
        for (const k of ['premiumWeekly', 'defaultWeekly'] as const) {
          const n = o?.[k];
          if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 50) return `${k} 는 0~50 정수`;
        }
        return null;
      },
    },
    qa_ticket_bundles: {
      label: '질문권 묶음 상품 (B1·O93)',
      defaults: [{ count: 5, discountPct: 10 }, { count: 10, discountPct: 20 }],
      validate: (v) => {
        if (!Array.isArray(v) || v.length > 5) return '묶음은 최대 5개 배열';
        for (const b of v as Array<{ count?: unknown; discountPct?: unknown }>) {
          if (typeof b?.count !== 'number' || !Number.isInteger(b.count) || b.count < 1 || b.count > 50) return 'count 는 1~50 정수';
          if (typeof b?.discountPct !== 'number' || b.discountPct < 0 || b.discountPct > 90) return 'discountPct 는 0~90';
        }
        return null;
      },
    },
  };

  /** 운영 정책 일괄 조회 — 저장값이 없으면 기본값으로 표시. */
  async getOpsSettings() {
    const keys = Object.keys(OpsService.OPS_KEYS);
    const rows = await this.prisma.system_setting.findMany({ where: { key: { in: keys } } });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    return keys.map((key) => {
      const meta = OpsService.OPS_KEYS[key];
      const saved = byKey.get(key);
      const value = Array.isArray(meta.defaults)
        ? (Array.isArray(saved) ? saved : meta.defaults)
        : { ...(meta.defaults as object), ...((saved as object) ?? {}) };
      return { key, label: meta.label, value, isDefault: saved === undefined };
    });
  }

  /** 운영 정책 저장 — 본사 마스터(admin·centerId 없음)만, 키 화이트리스트+검증. */
  async putOpsSetting(actor: AuthUser, key: string, value: unknown) {
    if (actor.role !== 'admin' || actor.centerId) throw new ForbiddenException('운영 정책은 본사 마스터관리자만 변경할 수 있습니다.');
    const meta = OpsService.OPS_KEYS[key];
    if (!meta) throw new BadRequestException('허용되지 않은 설정 키입니다.');
    const err = meta.validate(value);
    if (err) throw new BadRequestException(err);
    await this.prisma.system_setting.upsert({
      where: { key },
      create: { key, value: value as object, updated_by: actor.id },
      update: { value: value as object, updated_by: actor.id, updated_at: new Date() },
    });
    return { ok: true, key, value };
  }

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
      Math.max(0, Math.min(WEEKS - 1, Math.floor((now.getTime() - d.getTime()) / weekMs)));
    const trend = Array.from({ length: WEEKS }, (_, i) => ({
      weeksAgo: WEEKS - 1 - i,
      applied: 0,
      matched: 0,
    }));
    for (const r of createdRows) trend[WEEKS - 1 - bucket(r.created_at)].applied += 1;
    for (const r of doneRows)
      if (r.start_at) trend[WEEKS - 1 - bucket(r.start_at)].matched += 1;

    // 급여 기준 요약 — **실제 지급 산식**을 보여준다(O113: 매출 배분 단일 모델).
    // 이전에는 payroll_policy 의 건당 단가·시급·등급수당을 '등급별 급여표'로 렌더했다. 그 값들은 급여
    // 산정에서 폐지됐는데도(payroll.service 는 배분율만 쓴다) 관리자 화면에 남아 있었고, 더 나쁘게는
    // `?? 30000` 폴백이 **DB 에 없는 값을 창작**해 제시했다(실측: payroll_policy 0행인데 '건당 30,000원' 표시).
    // 등급(S/A/B)은 평가·배정에는 쓰이지만 지급액에는 영향이 없어 등급별 행 자체가 오해였다.
    const payBasis = await this.payrollBasis();

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
        trend,
        payBasis,
      },
      meta: {
        generatedAt: now.toISOString(),
        scope: centerId ? 'center' : 'global',
      },
    };
  }

  /**
   * 급여 기준 요약(표시용) — 실제 산식과 같은 소스를 읽는다.
   * 화면이 폐지된 단가를 말하지 않게 하려면 **지급에 쓰이는 값만** 노출해야 한다.
   * 정책 행이 없으면 코드 기본값이 적용되므로 그 사실도 함께 알린다(`source`).
   */
  private async payrollBasis() {
    const rows = await this.prisma.system_setting.findMany({
      where: { key: { in: ['payroll_share_policy', 'payroll_model_policy'] } },
    });
    const get = (k: string) => rows.find((r) => r.key === k)?.value as Record<string, unknown> | undefined;
    const share = get('payroll_share_policy');
    const model = get('payroll_model_policy');
    return {
      model: (model?.mode as string) ?? 'share',
      sharePct: Number(share?.sharePct ?? 60),
      base: Number(model?.base ?? 2_000_000),
      incentivePct: Number(model?.incentivePct ?? 30),
      creditWonRatio: CREDIT_WON_RATIO,
      source: share || model ? 'db' : 'default', // 'default' = 정책 행 없음(코드 기본값)
    };
  }

}
