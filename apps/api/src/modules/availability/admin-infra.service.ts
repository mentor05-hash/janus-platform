import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  hhmmToMin,
  kstDateString,
  kstMinutesInDay,
  weekdayKst,
} from '../../common/time/kst';
import {
  mondayOf,
  WeeklyTemplate,
} from './availability.service';
import {
  CreateBlockedTimeDto,
  CreateRoomDto,
  SetZoomPolicyDto,
  UpdateRoomDto,
} from './dto/admin-infra.dto';

/**
 * 관리자 인프라 (CLAUDE.md §3 availability): 줌 정책·상담실·차단 시간.
 * 차단 시간은 슬롯 계산(loadDayOccupancy)에 즉시 반영된다.
 */
@Injectable()
export class AdminInfraService {
  constructor(private readonly prisma: PrismaService) {}

  private requireCenter(actor: AuthUser): string {
    if (!actor.centerId)
      throw new BadRequestException('센터 소속 관리자만 가능합니다.');
    return actor.centerId;
  }

  // ── 줌 정책(center PK) ──
  async getZoomPolicy(actor: AuthUser) {
    const centerId = this.requireCenter(actor);
    const now = new Date();
    const [zp, currentUsage] = await Promise.all([
      this.prisma.zoom_policy.findUnique({ where: { center_id: centerId } }),
      // 지금 진행 중인 줌 예약 수(동시 사용량) — 한도 임박 표시용
      this.prisma.booking.count({
        where: {
          center_id: centerId,
          mode: 'zoom',
          status: { in: ['new', 'confirmed'] },
          start_at: { lte: now },
          end_at: { gt: now },
        },
      }),
    ]);
    const base = zp ?? { center_id: centerId, concurrent_limit: 6, allow_map: {} };
    return { ...base, currentUsage };
  }

  async setZoomPolicy(dto: SetZoomPolicyDto, actor: AuthUser) {
    const centerId = this.requireCenter(actor);
    const allowMap = (dto.allowMap ?? undefined) as
      | Prisma.InputJsonValue
      | undefined;
    return this.prisma.zoom_policy.upsert({
      where: { center_id: centerId },
      update: {
        concurrent_limit: dto.concurrentLimit,
        ...(allowMap !== undefined ? { allow_map: allowMap } : {}),
      },
      create: {
        center_id: centerId,
        concurrent_limit: dto.concurrentLimit,
        ...(allowMap !== undefined ? { allow_map: allowMap } : {}),
      },
    });
  }

  // ── 상담실 ──
  async listRooms(actor: AuthUser) {
    return this.prisma.room.findMany({
      where: { center_id: this.requireCenter(actor) },
    });
  }

  /**
   * 상담실 가용 자동 계산(§ROOMS): 이용 가능 = 총 − 현재 근무 중인 과목 선생님 수.
   * 수동 설정 방은 상태값(available)으로, 자동 방은 근무 교사 수 차감으로 계산.
   */
  async roomAvailability(actor: AuthUser, now = new Date()) {
    const centerId = this.requireCenter(actor);
    const [rooms, teachers] = await Promise.all([
      this.prisma.room.findMany({ where: { center_id: centerId } }),
      this.prisma.teacher_profile.findMany({
        where: { center_id: centerId },
        select: { work_schedule: true },
      }),
    ]);
    const dateStr = kstDateString(now);
    const nowMin = kstMinutesInDay(now, dateStr);
    const weekday = String(weekdayKst(dateStr));
    const monday = mondayOf(dateStr);

    let workingTeachers = 0;
    for (const t of teachers) {
      const ws = t.work_schedule[0];
      if (!ws) continue;
      const recurring = (ws.recurring_template as unknown as WeeklyTemplate) ?? {};
      const plans = Array.isArray(ws.week_plans)
        ? (ws.week_plans as unknown as { weekStart: string; template: WeeklyTemplate }[])
        : [];
      const plan = plans.find((p) => p && p.weekStart === monday);
      const tpl: WeeklyTemplate = plan
        ? { ...recurring, ...plan.template }
        : recurring;
      const wins = tpl[weekday] ?? [];
      const onShift = wins.some(
        (w) => nowMin >= hhmmToMin(w.start) && nowMin < hhmmToMin(w.end),
      );
      if (onShift) workingTeachers += 1;
    }

    const total = rooms.length;
    const manualAvailable = rooms.filter(
      (r) => r.setting === 'manual' && (r.status === 'available' || r.status === 'open'),
    ).length;
    const autoRooms = rooms.filter((r) => r.setting !== 'manual').length;
    const autoAvailable = Math.max(0, autoRooms - workingTeachers);
    const available = manualAvailable + autoAvailable;
    const inUse = Math.max(0, total - available);
    return {
      total,
      workingTeachers,
      autoRooms,
      manualAvailable,
      autoAvailable,
      available,
      inUse,
      util: total ? Math.round((inUse / total) * 100) : 0,
    };
  }

  async createRoom(dto: CreateRoomDto, actor: AuthUser) {
    return this.prisma.room.create({
      data: {
        center_id: this.requireCenter(actor),
        type: dto.type ?? null,
        capacity: dto.capacity ?? 1,
        operating_hours: dto.operatingHours ?? null,
        setting: dto.setting ?? 'auto',
      },
    });
  }

  async updateRoom(id: string, dto: UpdateRoomDto, actor: AuthUser) {
    const centerId = this.requireCenter(actor);
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room || room.center_id !== centerId)
      throw new NotFoundException('상담실을 찾을 수 없습니다.');
    return this.prisma.room.update({
      where: { id },
      data: {
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.operatingHours !== undefined
          ? { operating_hours: dto.operatingHours }
          : {}),
        ...(dto.setting !== undefined ? { setting: dto.setting } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  async deleteRoom(id: string, actor: AuthUser) {
    const centerId = this.requireCenter(actor);
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room || room.center_id !== centerId)
      throw new NotFoundException('상담실을 찾을 수 없습니다.');
    await this.prisma.room.delete({ where: { id } });
    return { id };
  }

  // ── 차단 시간 ──
  async listBlocked(actor: AuthUser) {
    return this.prisma.blocked_time.findMany({
      where: { center_id: this.requireCenter(actor) },
      orderBy: { start_at: 'desc' },
    });
  }

  async createBlocked(dto: CreateBlockedTimeDto, actor: AuthUser) {
    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);
    if (end <= start)
      throw new BadRequestException('endAt 은 startAt 보다 뒤여야 합니다.');
    return this.prisma.blocked_time.create({
      data: {
        center_id: this.requireCenter(actor),
        type: dto.type ?? null,
        start_at: start,
        end_at: end,
        scope: dto.scope ?? null,
      },
    });
  }

  async deleteBlocked(id: string, actor: AuthUser) {
    const centerId = this.requireCenter(actor);
    const bt = await this.prisma.blocked_time.findUnique({ where: { id } });
    if (!bt || bt.center_id !== centerId)
      throw new NotFoundException('차단 시간을 찾을 수 없습니다.');
    await this.prisma.blocked_time.delete({ where: { id } });
    return { id, deleted: true };
  }
}
