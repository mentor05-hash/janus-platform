import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateBlockedTimeDto,
  CreateRoomDto,
  SetZoomPolicyDto,
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
    const zp = await this.prisma.zoom_policy.findUnique({
      where: { center_id: centerId },
    });
    return zp ?? { center_id: centerId, concurrent_limit: 6, allow_map: {} };
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
