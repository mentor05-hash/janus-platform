import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  hhmmToMin,
  kstDateString,
  kstMinutesInDay,
  utcFromKst,
  weekdayKst,
} from '../../common/time/kst';
import {
  REST_BUFFER_MINUTES,
  SLOT_GRANULARITY_MINUTES,
} from '../../config/constants';
import { BookingStatus } from '../../config/enums';
import { buildDaySlots, Interval, isRangeBookable } from './domain/slots';

export interface DayWindow {
  start: string; // "HH:MM"
  end: string;
}
export type WeeklyTemplate = Record<string, DayWindow[]>; // key '0'..'6' (일~토)
export interface LeaveEntry { date: string; type: string } // 사유 제외(연차/반차/병가)
export interface WeekPlan { weekStart: string; template: WeeklyTemplate } // 주별 근무 계획(weekStart=월요일)

/** 해당 날짜가 속한 주의 월요일(YYYY-MM-DD, KST 기준 날짜 문자열). */
export function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=일..6=토
  dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return dt.toISOString().slice(0, 10);
}
function readWeekPlans(raw: unknown): WeekPlan[] {
  return Array.isArray(raw) ? (raw as WeekPlan[]).filter((p) => p && p.weekStart && p.template) : [];
}

const ACTIVE_STATUSES: BookingStatus[] = [
  BookingStatus.NEW,
  BookingStatus.CONFIRMED,
];

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  private windowsToIntervals(wins: DayWindow[] | undefined): Interval[] {
    return (wins ?? []).map((w) => ({
      start: hhmmToMin(w.start),
      end: hhmmToMin(w.end),
    }));
  }

  /** 학생 체류시간(요일) → 인터벌. 학생이 아니거나 미설정이면 종일. */
  private async resolveStay(
    studentId: string | undefined,
    weekday: string,
  ): Promise<Interval[]> {
    if (!studentId) return [{ start: 0, end: 1440 }]; // 익명 견적 — 제한 없음
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: studentId },
    });
    const stayTpl = (sp?.stay_time as unknown as WeeklyTemplate) ?? null;
    if (!stayTpl) return [{ start: 0, end: 1440 }]; // 체류시간 미설정 — 제한 없음
    // 템플릿은 있으나 해당 요일 창이 없으면 그 날은 체류 없음 → 예약 불가(종일로 오인 금지).
    return stayTpl[weekday] ? this.windowsToIntervals(stayTpl[weekday]) : [];
  }

  /**
   * 선생님 가용 슬롯 (§5-1). 학생이 조회하면 본인 체류시간과 교집합.
   * 반환: 10분 슬롯 상태 배열 + 그날 예약 가능 인터벌 계산의 입력.
   */
  async getDaySlots(teacherId: string, dateStr: string, studentId?: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new BadRequestException('date 는 YYYY-MM-DD 형식이어야 합니다.');
    }
    const teacher = await this.prisma.teacher_profile.findUnique({
      where: { account_id: teacherId },
      include: { work_schedule: true },
    });
    if (!teacher) throw new NotFoundException('선생님을 찾을 수 없습니다.');

    const weekday = String(weekdayKst(dateStr));
    const ws = teacher.work_schedule[0];
    // 주별 근무계획(week_plans)이 있으면 그 주 템플릿, 없으면 기본(recurring_template)
    const plans = readWeekPlans((ws as { week_plans?: unknown } | undefined)?.week_plans);
    const plan = plans.find((p) => p.weekStart === mondayOf(dateStr));
    const recurring = (ws?.recurring_template as unknown as WeeklyTemplate) ?? {};
    // 주계획은 부분 override — 지정한 요일만 덮어쓰고(휴무=빈 배열), 미지정 요일은 기본 유지.
    const template: WeeklyTemplate = plan ? { ...recurring, ...plan.template } : recurring;
    let work = this.windowsToIntervals(template[weekday]);
    // 사유 제외(연차·반차·병가): 연차·병가=종일 제외, 반차=오후(13:00~) 제외.
    const leave = this.readLeaves(ws?.weekly_overrides).find((l) => l.date === dateStr);
    if (leave) work = leave.type === '반차' ? work.filter((w) => w.end <= 780) : [];

    // 학생 체류시간(있으면 교집합, 없으면 종일)
    const stay = await this.resolveStay(studentId, weekday);

    const { bookings, blocked } = await this.loadDayOccupancy(
      teacherId,
      teacher.center_id,
      dateStr,
    );

    const dayStart = work.length ? Math.min(...work.map((w) => w.start)) : 0;
    const dayEnd = work.length ? Math.max(...work.map((w) => w.end)) : 0;
    const slots = buildDaySlots({
      work,
      stay,
      bookings,
      blocked,
      bufferMin: REST_BUFFER_MINUTES,
      slotMin: SLOT_GRANULARITY_MINUTES,
      dayStartMin: dayStart,
      dayEndMin: dayEnd,
    });
    return slots;
  }

  /** 예약 생성 직전 재검증용 — [start,end) 가 모두 avail 인지 (§5-1). */
  async assertBookable(
    teacherId: string,
    dateStr: string,
    startMin: number,
    endMin: number,
    studentId?: string,
  ): Promise<boolean> {
    const teacher = await this.prisma.teacher_profile.findUnique({
      where: { account_id: teacherId },
      include: { work_schedule: true },
    });
    if (!teacher) throw new NotFoundException('선생님을 찾을 수 없습니다.');

    const weekday = String(weekdayKst(dateStr));
    const ws = teacher.work_schedule[0];
    // 주별 근무계획(week_plans)이 있으면 그 주 템플릿, 없으면 기본(recurring_template)
    const plans = readWeekPlans((ws as { week_plans?: unknown } | undefined)?.week_plans);
    const plan = plans.find((p) => p.weekStart === mondayOf(dateStr));
    const recurring = (ws?.recurring_template as unknown as WeeklyTemplate) ?? {};
    // 주계획은 부분 override — 지정한 요일만 덮어쓰고(휴무=빈 배열), 미지정 요일은 기본 유지.
    const template: WeeklyTemplate = plan ? { ...recurring, ...plan.template } : recurring;
    let work = this.windowsToIntervals(template[weekday]);
    // 사유 제외(연차·반차·병가): 연차·병가=종일 제외, 반차=오후(13:00~) 제외.
    const leave = this.readLeaves(ws?.weekly_overrides).find((l) => l.date === dateStr);
    if (leave) work = leave.type === '반차' ? work.filter((w) => w.end <= 780) : [];

    const stay = await this.resolveStay(studentId, weekday);

    const { bookings, blocked } = await this.loadDayOccupancy(
      teacherId,
      teacher.center_id,
      dateStr,
    );
    return isRangeBookable(
      {
        work,
        stay,
        bookings,
        blocked,
        bufferMin: REST_BUFFER_MINUTES,
        slotMin: SLOT_GRANULARITY_MINUTES,
      },
      startMin,
      endMin,
    );
  }

  /** 그날 선생님 예약(점유) + 센터 차단시간을 '날짜 자정 기준 분' 인터벌로(L1: 24:00·자정 교차 안전). */
  private async loadDayOccupancy(
    teacherId: string,
    centerId: string | null,
    dateStr: string,
  ) {
    const dayStartUtc = utcFromKst(dateStr, 0);
    const dayEndUtc = utcFromKst(dateStr, 1440);
    const toMin = (d: Date) => kstMinutesInDay(d, dateStr);

    // 그날과 겹치는 예약(이전날 시작·자정 교차 포함) — start < dayEnd AND end > dayStart
    const rows = await this.prisma.booking.findMany({
      where: {
        teacher_id: teacherId,
        status: { in: ACTIVE_STATUSES },
        start_at: { lt: dayEndUtc },
        end_at: { gt: dayStartUtc },
      },
      select: { start_at: true, end_at: true },
    });
    const bookings: Interval[] = rows
      .filter((r) => r.start_at && r.end_at)
      .map((r) => ({ start: toMin(r.start_at!), end: toMin(r.end_at!) }));

    let blocked: Interval[] = [];
    if (centerId) {
      const blk = await this.prisma.blocked_time.findMany({
        where: {
          center_id: centerId,
          start_at: { lt: dayEndUtc },
          end_at: { gt: dayStartUtc },
        },
        select: { start_at: true, end_at: true },
      });
      blocked = blk.map((b) => ({
        start: toMin(b.start_at),
        end: toMin(b.end_at),
      }));
    }
    return { bookings, blocked };
  }

  async getWorkSchedule(teacherId: string) {
    const ws = await this.prisma.work_schedule.findFirst({
      where: { teacher_id: teacherId },
    });
    return (
      ws ?? {
        teacher_id: teacherId,
        recurring_template: {},
        weekly_overrides: [],
      }
    );
  }

  async putWorkSchedule(
    teacherId: string,
    dto: {
      recurringTemplate?: unknown;
      weeklyOverrides?: unknown;
      preBookHorizonDays?: number;
    },
    actor: { id: string; role: string },
  ) {
    // 소유권(§5-10/인가): 본인 또는 관리자/HR 만 수정 가능 (IDOR 방지)
    const isSelf = actor.role === 'teacher' && actor.id === teacherId;
    const isAdmin = actor.role === 'admin' || actor.role === 'hr';
    if (!isSelf && !isAdmin) {
      throw new ForbiddenException(
        '본인 또는 관리자만 근무표를 수정할 수 있습니다.',
      );
    }
    const existing = await this.prisma.work_schedule.findFirst({
      where: { teacher_id: teacherId },
    });
    const data = {
      recurring_template: dto.recurringTemplate ?? {},
      // 근무표만 저장할 때 사유 제외(연차)·주계획 이 지워지지 않도록 기존값 보존.
      weekly_overrides: dto.weeklyOverrides ?? existing?.weekly_overrides ?? [],
      week_plans: existing?.week_plans ?? [],
      pre_book_horizon_days: dto.preBookHorizonDays ?? 30,
    };
    if (existing) {
      return this.prisma.work_schedule.update({
        where: { id: existing.id },
        data,
      });
    }
    return this.prisma.work_schedule.create({
      data: { teacher_id: teacherId, ...data },
    });
  }

  // ── 주별 근무 계획(2주~2달 미리 설정) ──
  /** 현재 계획 + 기본 템플릿. defaultApplies=주계획이 하나도 없으면 true(기본 근무시간 적용 안내용). */
  async getWeekPlans(teacherId: string) {
    const ws = await this.prisma.work_schedule.findFirst({ where: { teacher_id: teacherId } });
    const plans = readWeekPlans(ws?.week_plans);
    return {
      recurringTemplate: (ws?.recurring_template as unknown as WeeklyTemplate) ?? {},
      weekPlans: plans.sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
      defaultApplies: plans.length === 0,
    };
  }

  /** 관리자: 선생님별 근무시간 일괄 적용(아이디로 매칭). 기본/주계획 함께. */
  async bulkApplySchedules(
    actor: { id: string; role: string; centerId?: string | null },
    items: { loginId: string; recurringTemplate?: WeeklyTemplate; weekPlans?: WeekPlan[] }[],
    todayStr: string,
  ) {
    if (!(actor.role === 'admin' || actor.role === 'hr')) {
      throw new ForbiddenException('관리자/HR만 일괄 적용할 수 있습니다.');
    }
    const results: { loginId: string; ok: boolean; error?: string }[] = [];
    for (const it of items) {
      try {
        const acc = await this.prisma.account.findUnique({ where: { login_id: it.loginId } });
        if (!acc || acc.role !== 'teacher') { results.push({ loginId: it.loginId, ok: false, error: '선생님 계정 없음' }); continue; }
        // 센터 관리자는 자기 센터 소속만(본사 admin=센터無 는 전체 허용)
        if (actor.role !== 'hr' && actor.centerId && acc.center_id && acc.center_id !== actor.centerId) {
          results.push({ loginId: it.loginId, ok: false, error: '다른 센터 소속' }); continue;
        }
        if (it.recurringTemplate && Object.keys(it.recurringTemplate).length) {
          await this.putWorkSchedule(acc.id, { recurringTemplate: it.recurringTemplate }, actor);
        }
        if (it.weekPlans && it.weekPlans.length) {
          await this.saveWeekPlans(acc.id, it.weekPlans, actor, todayStr);
        }
        results.push({ loginId: it.loginId, ok: true });
      } catch (e) {
        results.push({ loginId: it.loginId, ok: false, error: e instanceof Error ? e.message : '적용 실패' });
      }
    }
    return { results, applied: results.filter((r) => r.ok).length, total: results.length };
  }

  /** 주계획 저장. 다음 주 이후(미래)만 허용, 최대 8주(약 2달). */
  async saveWeekPlans(teacherId: string, plans: WeekPlan[], actor: { id: string; role: string }, todayStr: string) {
    this.assertScheduleOwner(teacherId, actor);
    const nextMonday = mondayOf(this.addDays(todayStr, 7));
    const clean = readWeekPlans(plans)
      .filter((p) => p.weekStart >= nextMonday) // 이번 주·과거는 변경 불가(다음 주부터)
      .filter((p, i, arr) => arr.findIndex((x) => x.weekStart === p.weekStart) === i);
    if (clean.length > 8) throw new BadRequestException('최대 8주(약 2달)까지 미리 설정할 수 있습니다.');
    const ws = await this.prisma.work_schedule.findFirst({ where: { teacher_id: teacherId } });
    if (ws) {
      await this.prisma.work_schedule.update({ where: { id: ws.id }, data: { week_plans: clean as unknown as object } });
    } else {
      await this.prisma.work_schedule.create({ data: { teacher_id: teacherId, week_plans: clean as unknown as object } });
    }
    return { weekPlans: clean };
  }

  /** 저장하려는 주계획과 학생 예약(confirmed/new)이 충돌하는지 검사. 근무시간 밖으로 밀린 예약을 반환. */
  async detectConflicts(teacherId: string, plans: WeekPlan[]) {
    const clean = readWeekPlans(plans);
    if (!clean.length) return { conflicts: [] };
    const weekStarts = clean.map((p) => p.weekStart).sort();
    const rangeStart = utcFromKst(weekStarts[0], 0);
    const rangeEnd = utcFromKst(this.addDays(weekStarts[weekStarts.length - 1], 7), 0);
    const rows = await this.prisma.booking.findMany({
      where: { teacher_id: teacherId, status: { in: ACTIVE_STATUSES }, start_at: { gte: rangeStart, lt: rangeEnd } },
      include: { student_profile: { include: { account: { select: { name: true } } } } },
    });
    const wsRow = await this.prisma.work_schedule.findFirst({ where: { teacher_id: teacherId } });
    const recurring = (wsRow?.recurring_template as unknown as WeeklyTemplate) ?? {};
    // 부분 override 반영: 계획 요일만 덮고 미지정 요일은 기본
    const planByWeek = new Map(clean.map((p) => [p.weekStart, { ...recurring, ...p.template } as WeeklyTemplate]));
    const conflicts: {
      bookingId: string; date: string; startMin: number; endMin: number;
      studentId: string; studentName: string; consultType: string | null; mode: string;
    }[] = [];
    for (const b of rows) {
      if (!b.start_at || !b.end_at) continue;
      const dateStr = kstDateString(b.start_at);
      const wk = mondayOf(dateStr);
      const tpl = planByWeek.get(wk);
      if (!tpl) continue; // 이 예약 주는 계획 대상 아님
      const weekday = String(weekdayKst(dateStr));
      const work = this.windowsToIntervals(tpl[weekday]);
      const s = kstMinutesInDay(b.start_at, dateStr);
      const e = kstMinutesInDay(b.end_at, dateStr);
      const within = work.some((w) => s >= w.start && e <= w.end);
      if (!within) {
        conflicts.push({
          bookingId: b.id, date: dateStr, startMin: s, endMin: e,
          studentId: b.student_id, studentName: b.student_profile?.account?.name ?? '학생',
          consultType: b.consult_type, mode: b.mode,
        });
      }
    }
    return { conflicts };
  }

  private addDays(dateStr: string, n: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
  }

  // ── 사유 제외(연차/반차/병가) — work_schedule.weekly_overrides 에 저장 ──
  private readLeaves(raw: unknown): LeaveEntry[] {
    return Array.isArray(raw)
      ? (raw as LeaveEntry[]).filter((l) => l && typeof l.date === 'string')
      : [];
  }
  private assertScheduleOwner(teacherId: string, actor: { id: string; role: string }) {
    const isSelf = actor.role === 'teacher' && actor.id === teacherId;
    const isAdmin = actor.role === 'admin' || actor.role === 'hr';
    if (!isSelf && !isAdmin) {
      throw new ForbiddenException('본인 또는 관리자만 변경할 수 있습니다.');
    }
  }
  async listLeave(teacherId: string): Promise<LeaveEntry[]> {
    const ws = await this.prisma.work_schedule.findFirst({ where: { teacher_id: teacherId } });
    return this.readLeaves(ws?.weekly_overrides).sort((a, b) => a.date.localeCompare(b.date));
  }
  async addLeave(teacherId: string, dto: { date: string; type: string }, actor: { id: string; role: string }) {
    this.assertScheduleOwner(teacherId, actor);
    const ws = await this.prisma.work_schedule.findFirst({ where: { teacher_id: teacherId } });
    const next = [
      ...this.readLeaves(ws?.weekly_overrides).filter((l) => l.date !== dto.date),
      { date: dto.date, type: dto.type },
    ].sort((a, b) => a.date.localeCompare(b.date));
    if (ws) {
      await this.prisma.work_schedule.update({ where: { id: ws.id }, data: { weekly_overrides: next as never } });
    } else {
      await this.prisma.work_schedule.create({ data: { teacher_id: teacherId, recurring_template: {}, weekly_overrides: next as never } });
    }
    return { data: next };
  }
  async removeLeave(teacherId: string, date: string, actor: { id: string; role: string }) {
    this.assertScheduleOwner(teacherId, actor);
    const ws = await this.prisma.work_schedule.findFirst({ where: { teacher_id: teacherId } });
    if (!ws) return { data: [] };
    const next = this.readLeaves(ws.weekly_overrides).filter((l) => l.date !== date);
    await this.prisma.work_schedule.update({ where: { id: ws.id }, data: { weekly_overrides: next as never } });
    return { data: next };
  }

  /** 오프라인 가능 설정 조회(본인 또는 관리자/HR). 미설정 시 enabled=false 기본값. */
  async getOfflineAvailability(
    teacherId: string,
    actor: { id: string; role: string },
  ) {
    const isSelf = actor.role === 'teacher' && actor.id === teacherId;
    const isAdmin = actor.role === 'admin' || actor.role === 'hr';
    if (!isSelf && !isAdmin) {
      throw new ForbiddenException(
        '본인 또는 관리자만 조회할 수 있습니다.',
      );
    }
    const teacher = await this.prisma.teacher_profile.findUnique({
      where: { account_id: teacherId },
      select: { center_id: true },
    });
    if (!teacher?.center_id) return { enabled: false, timeWindows: [] };
    const row = await this.prisma.teacher_offline_availability.findUnique({
      where: {
        teacher_id_center_id: {
          teacher_id: teacherId,
          center_id: teacher.center_id,
        },
      },
    });
    return {
      enabled: row?.enabled ?? false,
      timeWindows: (row?.time_windows as unknown[]) ?? [],
    };
  }

  /** 오프라인 가능 센터·시간 설정(본인 또는 관리자/HR). teacher 의 센터 기준 upsert. */
  async putOfflineAvailability(
    teacherId: string,
    dto: { enabled: boolean; timeWindows?: unknown },
    actor: { id: string; role: string },
  ) {
    const isSelf = actor.role === 'teacher' && actor.id === teacherId;
    const isAdmin = actor.role === 'admin' || actor.role === 'hr';
    if (!isSelf && !isAdmin) {
      throw new ForbiddenException(
        '본인 또는 관리자만 오프라인 가용을 설정할 수 있습니다.',
      );
    }
    const teacher = await this.prisma.teacher_profile.findUnique({
      where: { account_id: teacherId },
    });
    if (!teacher) throw new NotFoundException('선생님을 찾을 수 없습니다.');
    if (!teacher.center_id)
      throw new BadRequestException(
        '센터 소속 선생님만 오프라인 가용을 설정할 수 있습니다.',
      );

    const data = {
      enabled: dto.enabled,
      time_windows: dto.timeWindows ?? [],
    };
    return this.prisma.teacher_offline_availability.upsert({
      where: {
        teacher_id_center_id: {
          teacher_id: teacherId,
          center_id: teacher.center_id,
        },
      },
      update: data,
      create: { teacher_id: teacherId, center_id: teacher.center_id, ...data },
    });
  }
}
