import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
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

  /** 월간 시수 엑셀 일괄 업로드 — 건당/기본급 등 모든 근무자 시수를 한 번에 upsert. */
  async bulkMonthlyHoursExcel(actor: AuthUser, buffer: Buffer) {
    if (actor.role !== 'admin' && actor.role !== 'hr') {
      throw new ForbiddenException('관리자만 시수를 입력할 수 있습니다.');
    }
    let rows: Record<string, unknown>[];
    try {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
    } catch {
      throw new BadRequestException('엑셀을 읽을 수 없습니다(.xlsx).');
    }
    if (!rows.length) throw new BadRequestException('데이터가 없습니다.');

    const scope = this.scope(actor); // null=전체(본사급), 그 외 자기 센터 강제
    const result = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };
    for (let i = 0; i < rows.length; i++) {
      const norm: Record<string, unknown> = {};
      for (const k of Object.keys(rows[i])) norm[k.trim()] = rows[i][k];
      const loginId = String(norm['아이디'] ?? norm['로그인아이디'] ?? norm['id'] ?? '').trim();
      const name = String(norm['이름'] ?? norm['성명'] ?? '').trim();
      const ym = this.normYearMonth(String(norm['기간'] ?? norm['월'] ?? norm['년월'] ?? '').trim());
      const hoursRaw = norm['시수'] ?? norm['근무시수'] ?? norm['시간'] ?? norm['hours'];
      const empType = String(norm['고용형태'] ?? norm['근무형태'] ?? '').trim() || null;
      // 근무자별 단가(선택): 건당단가·시급·기본급 — 있으면 정책보다 우선 적용.
      const perCase = this.parseWon(norm['건당단가'] ?? norm['건당']);
      const hourly = this.parseWon(norm['시급']);
      const basePay = this.parseWon(norm['기본급'] ?? norm['기본급여']);
      const hours = Number(hoursRaw);
      if ((!loginId && !name) || !ym) { result.skipped++; result.errors.push(`${i + 2}행: 아이디(또는 이름)/기간 누락`); continue; }
      if (hoursRaw == null || Number.isNaN(hours) || hours < 0 || hours > 744) { result.skipped++; result.errors.push(`${i + 2}행: 시수 값 오류(0~744)`); continue; }
      try {
        const teacher = await this.resolveTeacher(scope, loginId, name);
        const existing = await this.prisma.teacher_monthly_hours.findFirst({ where: { teacher_id: teacher.account_id, year_month: ym } });
        const data = { hours, updated_by: actor.id, updated_at: new Date() };
        if (existing) await this.prisma.teacher_monthly_hours.update({ where: { id: existing.id }, data });
        else await this.prisma.teacher_monthly_hours.create({ data: { teacher_id: teacher.account_id, year_month: ym, ...data } });
        // 고용형태·단가는 값이 있는 컬럼만 갱신(빈 칸은 기존 유지).
        const prof: Record<string, unknown> = {};
        if (empType) prof.employment_type = empType;
        if (perCase != null) prof.per_case_rate = perCase;
        if (hourly != null) prof.hourly_rate = hourly;
        if (basePay != null) prof.pay_base = basePay;
        if (Object.keys(prof).length) await this.prisma.teacher_profile.update({ where: { account_id: teacher.account_id }, data: prof });
        existing ? result.updated++ : result.created++;
      } catch (e) { result.skipped++; result.errors.push(`${i + 2}행(${loginId || name}): ${(e as Error).message}`); }
    }
    return result;
  }

  /** 금액 셀 파싱(원). 빈 칸/비수치 → null(미변경). "30,000"·"30000원" 허용. */
  private parseWon(v: unknown): number | null {
    if (v == null || v === '') return null;
    const n = Number(String(v).replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }

  /** 기간 문자열을 YYYY-MM 으로 정규화(2026-07 / 2026.7 / 2026년 7월 / Date 직렬화 등). */
  private normYearMonth(raw: string): string | null {
    if (!raw) return null;
    const m = raw.match(/(\d{4})\D*(\d{1,2})/);
    if (!m) return null;
    const y = m[1]; const mo = String(Math.min(12, Math.max(1, Number(m[2])))).padStart(2, '0');
    return `${y}-${mo}`;
  }

  /** 로그인아이디 우선, 없으면 이름으로 선생님 조회(센터 스코프 강제·동명이인 방지). */
  private async resolveTeacher(scope: string | null, loginId: string, name: string) {
    const where: Prisma.teacher_profileWhereInput = { ...(scope ? { center_id: scope } : {}) };
    if (loginId) where.account = { login_id: loginId };
    else where.account = { name };
    const matches = await this.prisma.teacher_profile.findMany({ where, select: { account_id: true, account: { select: { name: true } } }, take: 2 });
    if (matches.length === 0) throw new NotFoundException('선생님을 찾을 수 없습니다.');
    if (matches.length > 1) throw new BadRequestException('동명이인 — 아이디로 지정하세요.');
    return matches[0];
  }

  /** 월간 시수 업로드용 엑셀 템플릿(근무자 유형별 단가 예시). 단가 칸은 선택(비우면 정책 단가 사용). */
  monthlyHoursTemplate(): Buffer {
    const sample = [
      { 아이디: 'teacher01', 이름: '', 기간: '2026-07', 시수: 96, 고용형태: '기본급', 기본급: 2500000, 시급: '', 건당단가: '' },
      { 아이디: 'teacher02', 이름: '', 기간: '2026-07', 시수: 40, 고용형태: '시급', 기본급: '', 시급: 25000, 건당단가: '' },
      { 아이디: 'teacher03', 이름: '', 기간: '2026-07', 시수: 0, 고용형태: '건당', 기본급: '', 시급: '', 건당단가: 35000 },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '월간시수');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
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
        employment_type: true,
        account: { select: { name: true } },
        center: { select: { name: true } },
      },
    });
    if (teachers.length === 0) {
      return { data: [], meta: { scope: centerFilter ?? 'global', count: 0 } };
    }

    const yearMonth = now.toISOString().slice(0, 7);
    const ids = teachers.map((t) => t.account_id);
    // N+1 제거: 선생님별 예약/후기/근무시간을 groupBy 3쿼리로 일괄 집계
    const [bookingGroups, reviewGroups, hoursRows] = await Promise.all([
      this.prisma.booking.groupBy({
        by: ['teacher_id', 'status'],
        where: { teacher_id: { in: ids }, ...startAt },
        _count: { _all: true },
      }),
      this.prisma.review.groupBy({
        by: ['teacher_id'],
        where: { teacher_id: { in: ids } },
        _avg: { rating_attitude: true, rating_content: true, rating_skill: true },
      }),
      this.prisma.teacher_monthly_hours.findMany({
        where: { teacher_id: { in: ids }, year_month: yearMonth },
        select: { teacher_id: true, hours: true },
      }),
    ]);
    const bkt = new Map<string, { total: number; done: number; rejected: number; noshow: number }>();
    for (const g of bookingGroups) {
      const e = bkt.get(g.teacher_id) ?? { total: 0, done: 0, rejected: 0, noshow: 0 };
      const c = g._count._all;
      e.total += c;
      if (g.status === BookingStatus.DONE) e.done += c;
      else if (g.status === BookingStatus.REJECTED) e.rejected += c;
      else if (g.status === BookingStatus.NOSHOW) e.noshow += c;
      bkt.set(g.teacher_id, e);
    }
    const rev = new Map(reviewGroups.map((g) => [g.teacher_id, g._avg]));
    const hrs = new Map(hoursRows.map((h) => [h.teacher_id, Number(h.hours)]));

    const rows = teachers.map((t) => {
      const b = bkt.get(t.account_id) ?? { total: 0, done: 0, rejected: 0, noshow: 0 };
      const a = rev.get(t.account_id);
      const sat =
        ((Number(a?.rating_attitude ?? 0) + Number(a?.rating_content ?? 0) + Number(a?.rating_skill ?? 0)) / 3) * 20;
      return {
        teacherId: t.account_id,
        name: t.account?.name ?? null,
        center: t.center?.name ?? null,
        centerId: t.center_id,
        directorRole: t.director_role,
        employmentType: t.employment_type ?? null,
        metrics: {
          total: b.total,
          completion: pct(b.done, b.total),
          rerequest: Number(t.re_request_rate ?? 0),
          reject: pct(b.rejected, b.total),
          noshow: pct(b.noshow, b.total),
          response: t.avg_response_min ?? 0,
          satisfaction: Math.round(sat * 10) / 10,
        },
        hours: hrs.has(t.account_id) ? hrs.get(t.account_id)! : null,
      };
    });

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

    // 제거전(raw) 건수 — 중복제거 전 원 상담건수(프로토타입 '제거전' 지표).
    const rawAgg = await this.prisma.$queryRaw<Array<{ key: string; month?: string; raw: number }>>(Prisma.sql`
      SELECT ${keyExpr} AS key, ${selectMonth}
        count(*)::int AS raw
      FROM booking
      WHERE ${whereSql}
      GROUP BY ${keyExpr}${groupMonth}`);
    const rawMap = new Map(rawAgg.map((r) => [`${r.key}|${r.month ?? ''}`, r.raw]));

    const rows = agg.map((r) => {
      const rawTotal = rawMap.get(`${r.key}|${r.month ?? ''}`) ?? r.total;
      const removed = Math.max(0, rawTotal - r.total);
      return {
        key: r.key,
        ...(monthly ? { month: r.month } : {}),
        rawTotal, // 제거전
        total: r.total, // 제거후(중복제거)
        dedupRemoved: removed, // 중복제거 건수
        dedupRate: pct(removed, rawTotal), // 중복제거율%
        done: r.done,
        rejected: r.rejected,
        noshow: r.noshow,
        cancelled: r.cancelled,
        completion: pct(r.done, r.total),
      };
    });

    return {
      data: rows,
      meta: {
        view,
        scope: centerFilter ?? 'global',
        dedup: '동일 T·U·D 1건(상태·분류 우선)',
      },
    };
  }

  /**
   * 상담기록 종류별 통계(§5 상담기록). 상담 종류(담임/교과/입시/심리)별로
   * done 상담 수·작성 기록 수(final/draft)·보호자 공개 수·기록작성률을 집계.
   * 센터 스코프 fail-closed(L3 는 자기 센터만). period/centerId 필터.
   */
  async consultationStats(
    actor: AuthUser,
    q: { period?: string; from?: string; to?: string; centerId?: string },
    now = new Date(),
  ) {
    const scope = this.scope(actor);
    const centerFilter = scope ?? q.centerId ?? null;
    const range = resolvePeriod(q.period, q.from, q.to, now);

    const conds: Prisma.Sql[] = [Prisma.sql`b.status = 'done'`];
    if (centerFilter) conds.push(Prisma.sql`b.center_id = ${centerFilter}::uuid`);
    if (range?.gte) conds.push(Prisma.sql`b.start_at >= ${range.gte}`);
    if (range?.lte) conds.push(Prisma.sql`b.start_at <= ${range.lte}`);
    const whereSql = Prisma.join(conds, ' AND ');

    const agg = await this.prisma.$queryRaw<
      Array<{ type: string; done: number; notes: number; final: number; draft: number; guardian_visible: number }>
    >(Prisma.sql`
      SELECT b.consult_type::text AS type,
        count(*)::int AS done,
        count(n.id)::int AS notes,
        count(n.id) FILTER (WHERE n.save_state = 'final')::int AS final,
        count(n.id) FILTER (WHERE n.save_state = 'draft')::int AS draft,
        count(n.id) FILTER (WHERE n.guardian_visible IS TRUE)::int AS guardian_visible
      FROM booking b
      LEFT JOIN consultation_note n ON n.booking_id = b.id
      WHERE ${whereSql}
      GROUP BY b.consult_type
      ORDER BY b.consult_type`);

    // 학생유형(재원/외부) 분리 집계 — type_code 미지정은 center_id 유무로 추정(resolveStudentType 동일 규칙)
    const byTypeRows = await this.prisma.$queryRaw<Array<{ student_type: string; done: number; notes: number; final: number }>>(Prisma.sql`
      SELECT CASE
          WHEN lower(coalesce(sp.type_code,'')) IN ('external','외부','외부학생') THEN 'external'
          WHEN lower(coalesce(sp.type_code,'')) IN ('enrolled','재원','학원생') THEN 'enrolled'
          WHEN sp.center_id IS NOT NULL THEN 'enrolled'
          ELSE 'external' END AS student_type,
        count(*)::int AS done,
        count(n.id)::int AS notes,
        count(n.id) FILTER (WHERE n.save_state = 'final')::int AS final
      FROM booking b
      JOIN student_profile sp ON sp.account_id = b.student_id
      LEFT JOIN consultation_note n ON n.booking_id = b.id
      WHERE ${whereSql}
      GROUP BY student_type`);
    const byStudentType = ['enrolled', 'external'].map((t) => {
      const r = byTypeRows.find((x) => x.student_type === t);
      return {
        studentType: t,
        label: t === 'enrolled' ? '학원생' : '외부학생',
        done: r?.done ?? 0,
        notes: r?.notes ?? 0,
        final: r?.final ?? 0,
        recordRate: pct(r?.notes ?? 0, r?.done ?? 0),
      };
    });

    const rows = agg.map((r) => ({
      type: r.type,
      done: r.done, // 완료 상담 수
      notes: r.notes, // 작성된 기록 수
      final: r.final, // 최종저장(공개 대상)
      draft: r.draft, // 임시저장(비공개)
      guardianVisible: r.guardian_visible, // 보호자 공개 기록 수
      recordRate: pct(r.notes, r.done), // 기록작성률%
      finalRate: pct(r.final, r.done), // 최종저장률%
    }));
    const sum = (k: 'done' | 'notes' | 'final' | 'draft' | 'guardianVisible') =>
      rows.reduce((a, r) => a + r[k], 0);
    const totalDone = sum('done');
    return {
      data: rows,
      byStudentType, // 재원/외부 분리 집계
      meta: {
        scope: centerFilter ?? 'global',
        totals: {
          done: totalDone,
          notes: sum('notes'),
          final: sum('final'),
          draft: sum('draft'),
          guardianVisible: sum('guardianVisible'),
          recordRate: pct(sum('notes'), totalDone),
          finalRate: pct(sum('final'), totalDone),
        },
      },
    };
  }

  // ── 대시보드 노출 정책(본사 마스터) ──────────────────────────────
  private static readonly VIS_KEY = 'dashboard_visibility';
  private static readonly VIS_DEFAULT: DashboardVisibility = {
    teacherEnabled: true,
    centerAdminTabs: ['summary', 'teachers', 'trend'],
    teacherTabs: ['summary', 'rank', 'trend'],
    disabledCenters: [],
  };

  async getVisibility(): Promise<DashboardVisibility> {
    const row = await this.prisma.system_setting.findUnique({ where: { key: DashboardService.VIS_KEY } });
    return { ...DashboardService.VIS_DEFAULT, ...((row?.value as object) ?? {}) };
  }

  async setVisibility(actor: AuthUser, dto: Partial<DashboardVisibility>) {
    this.assertHqSetting(actor); // 본사급만 전사 노출 정책 변경
    const next = { ...(await this.getVisibility()), ...dto };
    await this.prisma.system_setting.upsert({
      where: { key: DashboardService.VIS_KEY },
      create: { key: DashboardService.VIS_KEY, value: next as object, updated_by: actor.id },
      update: { value: next as object, updated_by: actor.id, updated_at: new Date() },
    });
    return next;
  }

  /** 현재 사용자에게 열린 대시보드 범위·탭(3형태 라우팅). */
  async access(actor: AuthUser) {
    const p = await this.getVisibility();
    if (this.isHq(actor)) {
      const centers = await this.prisma.center.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
      return { role: 'hq', scope: 'global', canSelectCenter: true, tabs: ['centers', 'summary', 'teachers', 'trend'], centers, policy: p };
    }
    if (actor.role === 'teacher') {
      const disabled = !p.teacherEnabled || p.disabledCenters.includes(actor.centerId ?? '');
      return { role: 'teacher', scope: 'self', enabled: !disabled, tabs: disabled ? [] : p.teacherTabs, canSelectCenter: false };
    }
    // 센터 관리자/HR
    const disabled = p.disabledCenters.includes(actor.centerId ?? '');
    return { role: 'centerAdmin', scope: 'center', centerId: actor.centerId, enabled: !disabled, tabs: disabled ? [] : p.centerAdminTabs, canSelectCenter: false };
  }

  /** 선생님 본인 성과 대시보드 — 센터 내 순위/지표/월별 추이(정책 게이팅). */
  async myDashboard(actor: AuthUser, now = new Date()) {
    if (actor.role !== 'teacher') throw new ForbiddenException('선생님만 조회할 수 있습니다.');
    const p = await this.getVisibility();
    if (!p.teacherEnabled || p.disabledCenters.includes(actor.centerId ?? '')) {
      return { enabled: false, tabs: [] as string[] };
    }
    // 센터 랭킹 재사용 → 본인 행/순위 추출
    const rank = await this.ranking(actor, {}, now);
    const rows = rank.data as Array<Record<string, unknown> & { teacherId: string; score: number }>;
    const me = rows.find((r) => r.teacherId === actor.id) ?? null;
    const avgScore = rows.length ? Math.round((rows.reduce((a, r) => a + (r.score ?? 0), 0) / rows.length) * 10) / 10 : 0;
    // 월별 추이(최근 6개월 상담·완료)
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const bookings = await this.prisma.booking.findMany({
      where: { teacher_id: actor.id, start_at: { gte: from } },
      select: { start_at: true, status: true },
    });
    const trendMap = new Map<string, { total: number; done: number }>();
    for (let i = 0; i < 6; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - i), 1));
      trendMap.set(d.toISOString().slice(0, 7), { total: 0, done: 0 });
    }
    for (const b of bookings) {
      const ym = b.start_at ? new Date(b.start_at).toISOString().slice(0, 7) : null;
      if (!ym || !trendMap.has(ym)) continue;
      const e = trendMap.get(ym)!;
      e.total += 1;
      if (b.status === BookingStatus.DONE) e.done += 1;
    }
    const trend = [...trendMap.entries()].map(([month, v]) => ({ month, ...v }));
    return {
      enabled: true,
      tabs: p.teacherTabs,
      me,
      rank: me?.rank ?? null,
      totalInCenter: rows.length,
      centerAvgScore: avgScore,
      weights: rank.meta.weights,
      trend,
    };
  }
}

export type DashboardVisibility = {
  teacherEnabled: boolean;
  centerAdminTabs: string[];
  teacherTabs: string[];
  disabledCenters: string[];
};
