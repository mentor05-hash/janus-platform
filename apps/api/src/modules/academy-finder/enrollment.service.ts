import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { EnrollmentDto } from './dto/enrollment.dto';

/**
 * 재원 표시·동의 — 스펙 §4·§6. 학생이 [재원 중] + 통계 활용 동의.
 * 원본 enrollment 은 통계(분기 집계) 외 용도 금지. 철회 시 차기 집계에서 제외.
 */
@Injectable()
export class EnrollmentService {
  constructor(private readonly prisma: PrismaService) {}

  /** POST /enrollments — 재원 표시+동의(멱등 upsert). */
  async enroll(user: AuthUser, dto: EnrollmentDto) {
    const academy = await this.prisma.academy.findUnique({ where: { id: dto.academyId }, select: { id: true } });
    if (!academy) throw new NotFoundException('학원을 찾을 수 없습니다.');
    await this.prisma.academy_enrollment.upsert({
      where: { user_id_academy_id: { user_id: user.id, academy_id: dto.academyId } },
      create: { user_id: user.id, academy_id: dto.academyId, status: 'self_reported', consent_stats: dto.consentStats, school: dto.school ?? null },
      update: { status: 'self_reported', consent_stats: dto.consentStats, school: dto.school ?? null, ts: new Date() },
    });
    return { ok: true, consentStats: dto.consentStats };
  }

  /** DELETE /enrollments/:academyId — 재원 철회(차기 집계 제외). */
  async withdraw(user: AuthUser, academyId: string) {
    const row = await this.prisma.academy_enrollment.findUnique({
      where: { user_id_academy_id: { user_id: user.id, academy_id: academyId } },
    });
    if (!row) throw new NotFoundException('재원 표시가 없습니다.');
    await this.prisma.academy_enrollment.update({
      where: { id: row.id },
      data: { status: 'withdrawn', consent_stats: false, ts: new Date() },
    });
    return { ok: true };
  }

  /** GET /enrollments/mine — 내 재원 표시(학원명 포함). 개별 성적은 미포함(§4). */
  async mine(user: AuthUser) {
    const rows = await this.prisma.academy_enrollment.findMany({
      where: { user_id: user.id, status: 'self_reported' },
      include: { academy: { select: { id: true, name: true } } },
    });
    return rows.map((r) => ({ academyId: r.academy.id, academyName: r.academy.name, consentStats: r.consent_stats, school: r.school }));
  }
}
