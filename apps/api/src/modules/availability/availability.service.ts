import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  hhmmToMin,
  kstMinutesInDay,
  utcFromKst,
  weekdayKst,
} from '../../common/time/kst';
import { REST_BUFFER_MINUTES, SLOT_GRANULARITY_MINUTES } from '../../config/constants';
import { BookingStatus } from '../../config/enums';
import { buildDaySlots, Interval, isRangeBookable } from './domain/slots';

interface DayWindow {
  start: string; // "HH:MM"
  end: string;
}
type WeeklyTemplate = Record<string, DayWindow[]>; // key '0'..'6' (일~토)

const ACTIVE_STATUSES: BookingStatus[] = [BookingStatus.NEW, BookingStatus.CONFIRMED];

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  private windowsToIntervals(wins: DayWindow[] | undefined): Interval[] {
    return (wins ?? []).map((w) => ({ start: hhmmToMin(w.start), end: hhmmToMin(w.end) }));
  }

  /** 학생 체류시간(요일) → 인터벌. 학생이 아니거나 미설정이면 종일. */
  private async resolveStay(studentId: string | undefined, weekday: string): Promise<Interval[]> {
    if (!studentId) return [{ start: 0, end: 1440 }]; // 익명 견적 — 제한 없음
    const sp = await this.prisma.student_profile.findUnique({ where: { account_id: studentId } });
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
    const template = (ws?.recurring_template as unknown as WeeklyTemplate) ?? {};
    const work = this.windowsToIntervals(template[weekday]);

    // 학생 체류시간(있으면 교집합, 없으면 종일)
    const stay = await this.resolveStay(studentId, weekday);

    const { bookings, blocked } = await this.loadDayOccupancy(teacherId, teacher.center_id, dateStr);

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
    const template = (ws?.recurring_template as unknown as WeeklyTemplate) ?? {};
    const work = this.windowsToIntervals(template[weekday]);

    const stay = await this.resolveStay(studentId, weekday);

    const { bookings, blocked } = await this.loadDayOccupancy(teacherId, teacher.center_id, dateStr);
    return isRangeBookable(
      { work, stay, bookings, blocked, bufferMin: REST_BUFFER_MINUTES, slotMin: SLOT_GRANULARITY_MINUTES },
      startMin,
      endMin,
    );
  }

  /** 그날 선생님 예약(점유) + 센터 차단시간을 '날짜 자정 기준 분' 인터벌로(L1: 24:00·자정 교차 안전). */
  private async loadDayOccupancy(teacherId: string, centerId: string | null, dateStr: string) {
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
        where: { center_id: centerId, start_at: { lt: dayEndUtc }, end_at: { gt: dayStartUtc } },
        select: { start_at: true, end_at: true },
      });
      blocked = blk.map((b) => ({ start: toMin(b.start_at), end: toMin(b.end_at) }));
    }
    return { bookings, blocked };
  }

  async getWorkSchedule(teacherId: string) {
    const ws = await this.prisma.work_schedule.findFirst({ where: { teacher_id: teacherId } });
    return ws ?? { teacher_id: teacherId, recurring_template: {}, weekly_overrides: [] };
  }

  async putWorkSchedule(
    teacherId: string,
    dto: { recurringTemplate?: unknown; weeklyOverrides?: unknown; preBookHorizonDays?: number },
    actor: { id: string; role: string },
  ) {
    // 소유권(§5-10/인가): 본인 또는 관리자/HR 만 수정 가능 (IDOR 방지)
    const isSelf = actor.role === 'teacher' && actor.id === teacherId;
    const isAdmin = actor.role === 'admin' || actor.role === 'hr';
    if (!isSelf && !isAdmin) {
      throw new ForbiddenException('본인 또는 관리자만 근무표를 수정할 수 있습니다.');
    }
    const existing = await this.prisma.work_schedule.findFirst({ where: { teacher_id: teacherId } });
    const data = {
      recurring_template: (dto.recurringTemplate ?? {}) as object,
      weekly_overrides: (dto.weeklyOverrides ?? []) as object,
      pre_book_horizon_days: dto.preBookHorizonDays ?? 30,
    };
    if (existing) {
      return this.prisma.work_schedule.update({ where: { id: existing.id }, data });
    }
    return this.prisma.work_schedule.create({ data: { teacher_id: teacherId, ...data } });
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
      throw new ForbiddenException('본인 또는 관리자만 오프라인 가용을 설정할 수 있습니다.');
    }
    const teacher = await this.prisma.teacher_profile.findUnique({ where: { account_id: teacherId } });
    if (!teacher) throw new NotFoundException('선생님을 찾을 수 없습니다.');
    if (!teacher.center_id) throw new BadRequestException('센터 소속 선생님만 오프라인 가용을 설정할 수 있습니다.');

    const data = { enabled: dto.enabled, time_windows: (dto.timeWindows ?? []) as object };
    return this.prisma.teacher_offline_availability.upsert({
      where: { teacher_id_center_id: { teacher_id: teacherId, center_id: teacher.center_id } },
      update: data,
      create: { teacher_id: teacherId, center_id: teacher.center_id, ...data },
    });
  }
}
