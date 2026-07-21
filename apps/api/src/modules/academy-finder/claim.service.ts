import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { DongResolver } from './dong-resolver';
import type {
  BusRouteUpsertDto,
  ClaimReviewDto,
  ClaimSubmitDto,
  ClassUpsertDto,
  CohortUpsertDto,
} from './dto/claim.dto';

/**
 * 학원 클레임·관리 — 세션 3. 클레임 신청(사업자 인증)→운영자 승인→반·버스·자가통계 편집.
 * 편집은 승인된 owner(또는 admin)만. 자가 통계는 'claimed'(미검증) 라벨 고정.
 */
@Injectable()
export class ClaimService {
  private readonly logger = new Logger(ClaimService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dong: DongResolver,
  ) {}

  private maskBizReg(v?: string | null): string | null {
    if (!v) return null;
    const d = String(v).replace(/[^0-9]/g, '');
    if (d.length < 5) return null;
    return `${d.slice(0, 3)}-${d.slice(3, 5)}-*****`;
  }

  // ── 클레임 신청·심사 ──────────────────────────────────────────────
  /** POST /claims — 학원 클레임 신청(teacher/hr/admin). */
  async submit(user: AuthUser, dto: ClaimSubmitDto) {
    const academy = await this.prisma.academy.findUnique({ where: { id: dto.academyId } });
    if (!academy) throw new NotFoundException('학원을 찾을 수 없습니다.');
    const active = await this.prisma.academy_claim.findFirst({
      where: { academy_id: dto.academyId, status: { in: ['pending', 'approved'] } },
    });
    if (active) {
      throw new BadRequestException(
        active.status === 'approved' ? '이미 승인된 운영자가 있는 학원입니다.' : '이미 심사 대기 중인 클레임이 있습니다.',
      );
    }
    const claim = await this.prisma.academy_claim.create({
      data: {
        academy_id: dto.academyId,
        claimant_id: user.id,
        biz_reg_file_id: dto.bizRegFileId ?? null,
        biz_reg_masked: this.maskBizReg(dto.bizRegNo),
        contact: dto.contact ?? null,
        note: dto.note ?? null,
        status: 'pending',
      },
    });
    await this.prisma.academy.update({ where: { id: dto.academyId }, data: { claim_status: 'pending' } });
    this.logger.log(`클레임 신청 academy=${dto.academyId} claimant=${user.id}`);
    return { id: claim.id, status: claim.status };
  }

  /** GET /claims/mine — 내 클레임 목록. */
  async myClaims(user: AuthUser) {
    const rows = await this.prisma.academy_claim.findMany({
      where: { claimant_id: user.id },
      orderBy: { created_at: 'desc' },
      include: { academy: { select: { id: true, name: true, claim_status: true, owner_id: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      status: c.status,
      reviewNote: c.review_note,
      createdAt: c.created_at,
      academy: { id: c.academy.id, name: c.academy.name, isOwner: c.academy.owner_id === user.id },
    }));
  }

  /** GET /admin/claims?status= — 심사 큐(운영자). */
  async adminList(status?: string) {
    const rows = await this.prisma.academy_claim.findMany({
      where: status ? { status } : { status: 'pending' },
      orderBy: { created_at: 'asc' },
      include: { academy: { select: { id: true, name: true, addr: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      status: c.status,
      claimantId: c.claimant_id,
      bizRegMasked: c.biz_reg_masked,
      bizRegFileId: c.biz_reg_file_id,
      contact: c.contact,
      note: c.note,
      createdAt: c.created_at,
      academy: c.academy,
    }));
  }

  /** POST /admin/claims/:id/review — 승인/반려. 승인 시 owner 지정 + source=claimed. */
  async review(admin: AuthUser, claimId: string, dto: ClaimReviewDto) {
    const claim = await this.prisma.academy_claim.findUnique({ where: { id: claimId } });
    if (!claim) throw new NotFoundException('클레임을 찾을 수 없습니다.');
    if (claim.status !== 'pending') throw new BadRequestException('이미 처리된 클레임입니다.');

    if (dto.approve) {
      await this.prisma.$transaction([
        this.prisma.academy_claim.update({
          where: { id: claimId },
          data: { status: 'approved', review_note: dto.reviewNote ?? null, reviewed_by: admin.id, reviewed_at: new Date() },
        }),
        this.prisma.academy.update({
          where: { id: claim.academy_id },
          data: { owner_id: claim.claimant_id, claim_status: 'approved', source: 'claimed', updated_at: new Date() },
        }),
      ]);
      this.logger.log(`클레임 승인 claim=${claimId} owner=${claim.claimant_id}`);
      return { ok: true, status: 'approved' };
    }
    // 반려: 다른 승인 클레임이 없으면 학원 claim_status 원복.
    await this.prisma.academy_claim.update({
      where: { id: claimId },
      data: { status: 'rejected', review_note: dto.reviewNote ?? null, reviewed_by: admin.id, reviewed_at: new Date() },
    });
    const stillApproved = await this.prisma.academy_claim.findFirst({ where: { academy_id: claim.academy_id, status: 'approved' } });
    if (!stillApproved) {
      await this.prisma.academy.update({ where: { id: claim.academy_id }, data: { claim_status: 'none' } });
    }
    return { ok: true, status: 'rejected' };
  }

  // ── 소유자 편집 게이트 ────────────────────────────────────────────
  private async assertOwner(user: AuthUser, academyId: string) {
    const a = await this.prisma.academy.findUnique({ where: { id: academyId }, select: { owner_id: true } });
    if (!a) throw new NotFoundException('학원을 찾을 수 없습니다.');
    if (user.role === AccountRole.ADMIN) return;
    if (a.owner_id !== user.id) throw new ForbiddenException('이 학원의 승인된 운영자가 아닙니다.');
  }

  // ── 반 CRUD ──────────────────────────────────────────────────────
  async createClass(user: AuthUser, academyId: string, dto: ClassUpsertDto) {
    await this.assertOwner(user, academyId);
    const c = await this.prisma.academy_class.create({
      data: {
        academy_id: academyId,
        subject: dto.subject,
        target_grades: dto.targetGrades ?? [],
        level: dto.level ?? 'regular',
        schedule: (dto.schedule ?? []) as object,
        capacity: dto.capacity ?? null,
        tuition_krw: dto.tuitionKrw ?? null,
        tuition_source: 'claimed', // 운영자 입력 → 미검증 라벨
        entry_test: dto.entryTest ?? false,
      },
    });
    await this.touch(academyId);
    return { id: c.id };
  }

  async updateClass(user: AuthUser, academyId: string, classId: string, dto: ClassUpsertDto) {
    await this.assertOwner(user, academyId);
    const existing = await this.prisma.academy_class.findFirst({ where: { id: classId, academy_id: academyId } });
    if (!existing) throw new NotFoundException('반을 찾을 수 없습니다.');
    await this.prisma.academy_class.update({
      where: { id: classId },
      data: {
        subject: dto.subject,
        target_grades: dto.targetGrades ?? [],
        level: dto.level ?? 'regular',
        schedule: (dto.schedule ?? []) as object,
        capacity: dto.capacity ?? null,
        tuition_krw: dto.tuitionKrw ?? null,
        entry_test: dto.entryTest ?? false,
        updated_at: new Date(),
      },
    });
    await this.touch(academyId);
    return { ok: true };
  }

  async deleteClass(user: AuthUser, academyId: string, classId: string) {
    await this.assertOwner(user, academyId);
    const existing = await this.prisma.academy_class.findFirst({ where: { id: classId, academy_id: academyId } });
    if (!existing) throw new NotFoundException('반을 찾을 수 없습니다.');
    await this.prisma.academy_class.delete({ where: { id: classId } });
    await this.touch(academyId);
    return { ok: true };
  }

  // ── 버스 노선/정류장 ─────────────────────────────────────────────
  /** 노선 생성(정류장 포함). dong_code 는 DongResolver 로 결정. */
  async createBusRoute(user: AuthUser, academyId: string, dto: BusRouteUpsertDto) {
    await this.assertOwner(user, academyId);
    const route = await this.prisma.bus_route.create({
      data: { academy_id: academyId, name: dto.name, days: dto.days ?? [], direction: dto.direction ?? 'pickup' },
    });
    await this.replaceStops(route.id, dto.stops ?? []);
    await this.touch(academyId);
    return { id: route.id };
  }

  /** 노선 수정(정류장 전체 교체). */
  async updateBusRoute(user: AuthUser, academyId: string, routeId: string, dto: BusRouteUpsertDto) {
    await this.assertOwner(user, academyId);
    const route = await this.prisma.bus_route.findFirst({ where: { id: routeId, academy_id: academyId } });
    if (!route) throw new NotFoundException('노선을 찾을 수 없습니다.');
    await this.prisma.bus_route.update({
      where: { id: routeId },
      data: { name: dto.name, days: dto.days ?? [], direction: dto.direction ?? 'pickup' },
    });
    await this.replaceStops(routeId, dto.stops ?? []);
    await this.touch(academyId);
    return { ok: true };
  }

  async deleteBusRoute(user: AuthUser, academyId: string, routeId: string) {
    await this.assertOwner(user, academyId);
    const route = await this.prisma.bus_route.findFirst({ where: { id: routeId, academy_id: academyId } });
    if (!route) throw new NotFoundException('노선을 찾을 수 없습니다.');
    await this.prisma.bus_route.delete({ where: { id: routeId } });
    await this.touch(academyId);
    return { ok: true };
  }

  private async replaceStops(routeId: string, stops: BusRouteUpsertDto['stops']) {
    await this.prisma.bus_stop.deleteMany({ where: { route_id: routeId } });
    let seq = 0;
    for (const st of stops ?? []) {
      const dongCode = await this.dong.resolve({ dongCode: st.dongCode, lat: st.lat, lng: st.lng });
      await this.prisma.bus_stop.create({
        data: {
          route_id: routeId,
          seq: st.seq ?? seq,
          name: st.name,
          lat: st.lat ?? null,
          lng: st.lng ?? null,
          dong_code: dongCode,
          time_hint: st.timeHint ?? null,
        },
      });
      seq += 1;
    }
  }

  // ── 자가 통계(claimed) ───────────────────────────────────────────
  async upsertCohort(user: AuthUser, academyId: string, dto: CohortUpsertDto) {
    await this.assertOwner(user, academyId);
    await this.prisma.cohort_stat.upsert({
      where: { academy_id_kind_period_source: { academy_id: academyId, kind: dto.kind, period: dto.period, source: 'claimed' } },
      create: { academy_id: academyId, kind: dto.kind, period: dto.period, source: 'claimed', payload_json: dto.payload as object },
      update: { payload_json: dto.payload as object, updated_at: new Date() },
    });
    await this.touch(academyId);
    return { ok: true, source: 'claimed' };
  }

  private async touch(academyId: string) {
    await this.prisma.academy.update({ where: { id: academyId }, data: { updated_at: new Date() } });
  }
}
