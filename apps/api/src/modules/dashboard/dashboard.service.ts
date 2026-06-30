import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BookingStatus } from '../../config/enums';
import { permAtLeast } from '../../config/perm';
import { dashFlag } from '../../config/env.validation';
import {
  DirectorDto,
  MonthlyHoursDto,
  PivotView,
  UpdateWeightsDto,
} from './dto/dashboard.dto';
import {
  buildPriorityCase,
  CATEGORY_DEDUP_ORDER,
  minMaxNormalize,
  pct,
  resolvePeriod,
  STATUS_DEDUP_ORDER,
  weightedScore,
  weightsSumTo100,
  WEIGHT_KEYS,
  Weights,
  zScoreTo0100,
} from './domain/metrics';

/**
 * 대시보드(평가/순위·센터비교·피벗) — §D 권한 매트릭스를 서비스 계층에서 강제(fail-closed).
 * 본사급(L2↑)=전체, 센터관리자(L3)=자기 센터, HR=자기 센터. 설정(가중치/원장)=본사급만.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 스코프 헬퍼 ────────────────────────────────────────────────
  /** 조회 범위 센터: null=전체(본사급), 그 외=자기 센터로 강제. */
  private scope(actor: AuthUser): string | null {
    return actor.centerId ?? null;
  }
  private isHq(actor: AuthUser): boolean {
    return actor.centerId == null && actor.role === 'admin';
  }
  /** 설정 권한(가중치·원장): 본사급 L2 이상만. */
  private assertHqSetting(actor: AuthUser): void {
    if (!permAtLeast(actor.permLevel, 'L2')) {
      throw new ForbiddenException('본사급(L2) 이상만 설정할 수 있습니다.');
    }
  }

  // ── 평가 가중치 ────────────────────────────────────────────────
  async getWeights(actor: AuthUser, centerId?: string) {
    // 센터관리자는 자기 센터(또는 전사 기본)만 조회
    const target = this.isHq(actor) ? (centerId ?? null) : this.scope(actor);
    const policy =
      (target
        ? await this.prisma.evaluation_weight_policy.findFirst({
            where: { center_id: target },
          })
        : null) ??
      (await this.prisma.evaluation_weight_policy.findFirst({
        where: { center_id: null },
      }));
    return {
      data: policy,
      meta: { centerId: target, fallbackGlobal: !policy?.center_id },
    };
  }

  async updateWeights(actor: AuthUser, dto: UpdateWeightsDto) {
    this.assertHqSetting(actor);
    const weights = Object.fromEntries(
      WEIGHT_KEYS.map((k) => [k, dto[k]]),
    ) as Weights;
    if (!weightsSumTo100(weights)) {
      throw new BadRequestException('가중치 합계는 정확히 100 이어야 합니다.');
    }
    const centerId = dto.centerId ?? null;
    const existing = await this.prisma.evaluation_weight_policy.findFirst({
      where: { center_id: centerId },
    });
    const data = { ...weights, updated_by: actor.id, updated_at: new Date() };
    const saved = existing
      ? await this.prisma.evaluation_weight_policy.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.evaluation_weight_policy.create({
          data: { ...data, center_id: centerId },
        });
    return { data: saved };
  }

  // ── 월별 시수 / 원장 지정 ──────────────────────────────────────
  async setMonthlyHours(actor: AuthUser, teacherId: string, dto: MonthlyHoursDto) {
    await this.assertTeacherInScope(actor, teacherId);
    const existing = await this.prisma.teacher_monthly_hours.findFirst({
      where: { teacher_id: teacherId, year_month: dto.yearMonth },
    });
    const data = { hours: dto.hours, updated_by: actor.id, updated_at: new Date() };
    const saved = existing
      ? await this.prisma.teacher_monthly_hours.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.teacher_monthly_hours.create({
          data: { teacher_id: teacherId, year_month: dto.yearMonth, ...data },
        });
    return { data: saved };
  }

  async setDirector(actor: AuthUser, teacherId: string, dto: DirectorDto) {
    this.assertHqSetting(actor); // 원장 지정은 본사급만
    const t = await this.prisma.teacher_profile.findUnique({
      where: { account_id: teacherId },
    });
    if (!t) throw new NotFoundException('선생님을 찾을 수 없습니다.');
    const saved = await this.prisma.teacher_profile.update({
      where: { account_id: teacherId },
      data: { director_role: dto.directorRole ?? null },
    });
    return { data: { teacherId, directorRole: saved.director_role } };
  }

  /** 센터관리자는 자기 센터 선생님만(타 센터 403, SC-02 격리 패턴). */
  private async assertTeacherInScope(actor: AuthUser, teacherId: string) {
    const t = await this.prisma.teacher_profile.findUnique({
      where: { account_id: teacherId },
      select: { center_id: true },
    });
    if (!t) throw new NotFoundException('선생님을 찾을 수 없습니다.');
    if (!this.isHq(actor) && t.center_id !== actor.centerId) {
      throw new ForbiddenException('다른 센터 선생님은 관리할 수 없습니다.');
    }
  }

  // ── 가중 평가·순위 ─────────────────────────────────────────────
  async ranking(
    actor: AuthUser,
    q: { period?: string; from?: string; to?: string; centerId?: string; director?: string },
    now = new Date(),
  ) {
    const scope = this.scope(actor);
    // 본사급이 특정 센터를 지정하면 그 센터로, 아니면 스코프(전체/자기센터)
    const centerFilter = scope ?? q.centerId ?? null;
    const range = resolvePeriod(q.period, q.from, q.to, now);
    const startAt = range ? { start_at: range } : {};

    const teachers = await this.prisma.teacher_profile.findMany({
      where: {
        ...(centerFilter ? { center_id: centerFilter } : {}),
        ...(q.director ? { director_role: q.director } : {}),
      },
      select: {
        account_id: true,
        center_id: true,
        re_request_rate: true,
        avg_response_min: true,
        director_role: true,
        account: { select: { name: true } },
        center: { select: { name: true } },
      },
    });
    if (teachers.length === 0) {
      return { data: [], meta: { scope: centerFilter ?? 'global', count: 0 } };
    }

    const yearMonth = now.toISOString().slice(0, 7);
    // 선생님별 원천 지표 수집
    const rows = await Promise.all(
      teachers.map(async (t) => {
        const where = { teacher_id: t.account_id, ...startAt };
        const [total, done, rejected, noshow, reviewAgg, hours] = await Promise.all([
          this.prisma.booking.count({ where }),
          this.prisma.booking.count({ where: { ...where, status: BookingStatus.DONE } }),
          this.prisma.booking.count({ where: { ...where, status: BookingStatus.REJECTED } }),
          this.prisma.booking.count({ where: { ...where, status: BookingStatus.NOSHOW } }),
          this.prisma.review.aggregate({
            where: { teacher_id: t.account_id },
            _avg: { rating_attitude: true, rating_content: true, rating_skill: true },
          }),
          this.prisma.teacher_monthly_hours.findFirst({
            where: { teacher_id: t.account_id, year_month: yearMonth },
          }),
        ]);
        const sat =
          ((Number(reviewAgg._avg.rating_attitude ?? 0) +
            Number(reviewAgg._avg.rating_content ?? 0) +
            Number(reviewAgg._avg.rating_skill ?? 0)) /
            3) *
          20; // 5점 → 100점 환산
        return {
          teacherId: t.account_id,
          name: t.account?.name ?? null,
          center: t.center?.name ?? null,
          centerId: t.center_id,
          directorRole: t.director_role,
          metrics: {
            total,
            completion: pct(done, total),
            rerequest: Number(t.re_request_rate ?? 0),
            reject: pct(rejected, total),
            noshow: pct(noshow, total),
            response: t.avg_response_min ?? 0,
            satisfaction: Math.round(sat * 10) / 10,
          },
          hours: hours ? Number(hours.hours) : null,
        };
      }),
    );

    // 표본 내 지표별 정규화(역지표 반전)
    const metricKeys = [
      'total',
      'completion',
      'rerequest',
      'reject',
      'noshow',
      'response',
      'satisfaction',
    ] as const;
    const norm: Record<string, number[]> = {};
    for (const m of metricKeys) {
      const reverse = m === 'reject' || m === 'noshow' || m === 'response';
      norm[m] = minMaxNormalize(
        rows.map((r) => r.metrics[m]),
        reverse,
      );
    }
    const weights = await this.resolveWeights(centerFilter);

    const scored = rows.map((r, i) => {
      const normByMetric = Object.fromEntries(
        metricKeys.map((m) => [m, norm[m][i]]),
      );
      const score = weightedScore(normByMetric, weights);
      return {
        ...r,
        score,
        perHour:
          r.hours && r.hours > 0
            ? Math.round((r.metrics.total / r.hours) * 100) / 100
            : null, // 시간당 상담 건수
      };
    });
    scored.sort((a, b) => b.score - a.score);
    scored.forEach((s, i) => ((s as Record<string, unknown>).rank = i + 1));

    return {
      data: scored,
      meta: {
        scope: centerFilter ?? 'global',
        count: scored.length,
        weights,
        yearMonth,
      },
    };
  }

  private async resolveWeights(centerId: string | null): Promise<Weights> {
    const policy =
      (centerId
        ? await this.prisma.evaluation_weight_policy.findFirst({
            where: { center_id: centerId },
          })
        : null) ??
      (await this.prisma.evaluation_weight_policy.findFirst({
        where: { center_id: null },
      }));
    const fallback: Weights = {
      w_total: 20,
      w_completion: 20,
      w_rerequest: 15,
      w_reject: 10,
      w_noshow: 10,
      w_response: 10,
      w_satisfaction: 15,
    };
    if (!policy) return fallback;
    return Object.fromEntries(
      WEIGHT_KEYS.map((k) => [k, policy[k] ?? fallback[k]]),
    ) as Weights;
  }

  // ── 센터 비교(z-score 0~100) ──────────────────────────────────
  async centerComparison(
    actor: AuthUser,
    q: { period?: string; from?: string; to?: string },
    now = new Date(),
  ) {
    const range = resolvePeriod(q.period, q.from, q.to, now);
    const startAt = range ? { start_at: range } : {};
    const centers = await this.prisma.center.findMany({
      select: { id: true, name: true },
    });

    const raw = await Promise.all(
      centers.map(async (c) => {
        const where = { center_id: c.id, ...startAt };
        const [total, done, noshow, reviewAgg] = await Promise.all([
          this.prisma.booking.count({ where }),
          this.prisma.booking.count({ where: { ...where, status: BookingStatus.DONE } }),
          this.prisma.booking.count({ where: { ...where, status: BookingStatus.NOSHOW } }),
          this.prisma.review.aggregate({
            where: { booking: { center_id: c.id } },
            _avg: { rating_attitude: true, rating_content: true, rating_skill: true },
          }),
        ]);
        const sat =
          ((Number(reviewAgg._avg.rating_attitude ?? 0) +
            Number(reviewAgg._avg.rating_content ?? 0) +
            Number(reviewAgg._avg.rating_skill ?? 0)) /
            3) *
          20;
        return {
          centerId: c.id,
          name: c.name,
          raw: {
            total,
            completion: pct(done, total),
            noshow: pct(noshow, total),
            satisfaction: Math.round(sat * 10) / 10,
          },
        };
      }),
    );

    const zTotal = zScoreTo0100(raw.map((r) => r.raw.total));
    const zCompletion = zScoreTo0100(raw.map((r) => r.raw.completion));
    const zNoshow = zScoreTo0100(raw.map((r) => r.raw.noshow), true);
    const zSat = zScoreTo0100(raw.map((r) => r.raw.satisfaction));
    const scored = raw.map((r, i) => ({
      ...r,
      z: { total: zTotal[i], completion: zCompletion[i], noshow: zNoshow[i], satisfaction: zSat[i] },
      score0to100:
        Math.round(((zTotal[i] + zCompletion[i] + zNoshow[i] + zSat[i]) / 4) * 10) / 10,
      rank: 0,
    }));
    scored.sort((a, b) => b.score0to100 - a.score0to100);
    scored.forEach((s, i) => (s.rank = i + 1));

    // 센터관리자: 자기 센터 위치만(타 센터 상세 비공개), 단 벤치마킹 ENV 활성 시 익명 평균 추가
    if (!this.isHq(actor)) {
      const mine = scored.find((s) => s.centerId === actor.centerId);
      const benchmark = dashFlag(process.env.DASH_BENCHMARK_ANON)
        ? {
            anonAvgScore:
              Math.round(
                (scored.reduce((a, s) => a + s.score0to100, 0) / scored.length) * 10,
              ) / 10,
            centerCount: scored.length,
          }
        : null;
      return {
        data: mine ? [mine] : [],
        meta: { scope: 'center', myRank: mine?.rank ?? null, benchmark },
      };
    }
    return { data: scored, meta: { scope: 'global', count: scored.length } };
  }

  // ── 5 피벗 뷰 ─────────────────────────────────────────────────
  /**
   * 5 피벗 뷰. 같은 선생님·학생·날짜(T·U·D)에 여러 예약이 있으면 §2.2 대로 1건만 집계
   * (상태·분류 우선순위로 대표 1건 선택). 중복제거+집계를 DB(`DISTINCT ON`+`GROUP BY`)에서
   * 수행 — 전건을 앱 메모리에 올리지 않아 대량에도 안전.
   */
  async pivots(
    actor: AuthUser,
    view: PivotView,
    q: { period?: string; from?: string; to?: string; centerId?: string; teacherId?: string },
    now = new Date(),
  ) {
    const scope = this.scope(actor); // null=전체, 그 외=자기센터 강제
    const range = resolvePeriod(q.period, q.from, q.to, now);
    const centerFilter = scope ?? q.centerId ?? null;
    const monthly = view === 'teacher-monthly' || view === 'center-monthly';
    const centerKeyed = view === 'center' || view === 'center-monthly';
    const teacherScoped =
      view === 'teacher-in-center' ||
      view === 'teacher-x-center' ||
      view === 'teacher-monthly';

    // ── WHERE (값은 파라미터화, fail-closed 스코프는 위에서 결정) ──
    const conds: Prisma.Sql[] = [Prisma.sql`start_at IS NOT NULL`];
    if (centerFilter) conds.push(Prisma.sql`center_id = ${centerFilter}::uuid`);
    if (q.teacherId && teacherScoped) {
      conds.push(Prisma.sql`teacher_id = ${q.teacherId}::uuid`);
    }
    if (centerKeyed) conds.push(Prisma.sql`center_id IS NOT NULL`);
    if (range?.gte) conds.push(Prisma.sql`start_at >= ${range.gte}`);
    if (range?.lte) conds.push(Prisma.sql`start_at <= ${range.lte}`);
    const whereSql = Prisma.join(conds, ' AND ');

    // ── 정적 식(내부 ENUM/컬럼만 — 안전) ──
    const dayExpr = Prisma.raw(`(start_at AT TIME ZONE 'UTC')::date`);
    const monthExpr = Prisma.raw(`to_char(start_at AT TIME ZONE 'UTC', 'YYYY-MM')`);
    const statusCase = Prisma.raw(buildPriorityCase('status::text', STATUS_DEDUP_ORDER));
    const catCase = Prisma.raw(buildPriorityCase('consult_type::text', CATEGORY_DEDUP_ORDER));
    const keyExpr = centerKeyed
      ? Prisma.raw(`center_id::text`)
      : view === 'teacher-x-center'
        ? Prisma.raw(`teacher_id::text || '|' || coalesce(center_id::text, '')`)
        : Prisma.raw(`teacher_id::text`); // teacher-in-center / teacher-monthly

    // T·U·D 당 1건(상태→분류 우선) 선택
    const deduped = Prisma.sql`
      SELECT DISTINCT ON (teacher_id, student_id, ${dayExpr})
        teacher_id, center_id, status::text AS status, start_at
      FROM booking
      WHERE ${whereSql}
      ORDER BY teacher_id, student_id, ${dayExpr}, ${statusCase}, ${catCase}, start_at`;

    const selectMonth = monthly ? Prisma.sql`${monthExpr} AS month,` : Prisma.empty;
    const groupMonth = monthly ? Prisma.sql`, ${monthExpr}` : Prisma.empty;
    const orderMonth = monthly ? Prisma.sql`, month` : Prisma.empty;

    const agg = await this.prisma.$queryRaw<
      Array<{
        key: string;
        month?: string;
        total: number;
        done: number;
        rejected: number;
        noshow: number;
        cancelled: number;
      }>
    >(Prisma.sql`
      SELECT ${keyExpr} AS key, ${selectMonth}
        count(*)::int AS total,
        count(*) FILTER (WHERE status = 'done')::int AS done,
        count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
        count(*) FILTER (WHERE status = 'noshow')::int AS noshow,
        count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
      FROM (${deduped}) d
      GROUP BY ${keyExpr}${groupMonth}
      ORDER BY ${keyExpr}${orderMonth}`);

    const rows = agg.map((r) => ({
      key: r.key,
      ...(monthly ? { month: r.month } : {}),
      total: r.total,
      done: r.done,
      rejected: r.rejected,
      noshow: r.noshow,
      cancelled: r.cancelled,
      completion: pct(r.done, r.total),
    }));

    return {
      data: rows,
      meta: {
        view,
        scope: centerFilter ?? 'global',
        dedup: '동일 T·U·D 1건(상태·분류 우선)',
      },
    };
  }
}
