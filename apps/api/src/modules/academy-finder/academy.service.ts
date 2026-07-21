import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPageMeta } from '../../common/dto/pagination.dto';
import type { AcademySearchDto } from './dto/academy-search.dto';
import {
  academySourceLabel,
  cohortSourceLabel,
  tuitionSourceLabel,
} from './provenance';

/**
 * 학원찾기 조회 — 세션 1: 검색(카드 필드)·상세(반·버스·cohort·provenance).
 * 정산·매칭 점수와 무관한 읽기 도메인. 이용자 집 주소·좌표는 저장/질의하지 않는다(§4).
 */
@Injectable()
export class AcademyService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /academies — 카드 리스트(페이지네이션). 세션 1은 과목·행정동·이름 필터만. */
  async search(dto: AcademySearchDto) {
    const where: Prisma.academyWhereInput = { active: true };
    if (dto.q) where.name = { contains: dto.q, mode: 'insensitive' };
    if (dto.subject || dto.level) {
      where.classes = {
        some: {
          active: true,
          ...(dto.subject ? { subject: dto.subject } : {}),
          ...(dto.level ? { level: dto.level } : {}),
        },
      };
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.academy.count({ where }),
      this.prisma.academy.findMany({
        where,
        orderBy: [{ updated_at: 'desc' }],
        skip: (dto.page - 1) * dto.size,
        take: dto.size,
        include: {
          classes: {
            where: { active: true },
            orderBy: { tuition_krw: 'asc' },
            take: 3,
          },
          cohort_stats: { where: { source: 'verified' }, take: 1 },
          bus_routes: {
            where: { active: true },
            // dong 질의 시에만 해당 동 정류장을 실어 "우리 동네 경유" 판정. 미질의 시 정류장 미로드.
            include: { stops: dto.dong ? { where: { dong_code: dto.dong } } : { take: 0 } },
          },
        },
      }),
    ]);

    const data = rows.map((a) => {
      const rep = a.classes[0];
      const busPass = dto.dong
        ? a.bus_routes.some((r) => r.stops.length > 0)
        : false;
      return {
        id: a.id,
        name: a.name,
        addr: a.addr,
        dongCode: a.dong_code,
        source: a.source,
        sourceLabel: academySourceLabel(a.source),
        nearestStation: a.nearest_station ?? null,
        verified: a.cohort_stats.length > 0, // verified 배지 보유 여부
        busPass, // "우리 동네 경유"(dong 질의 시)
        repClass: rep
          ? {
              subject: rep.subject,
              level: rep.level,
              tuitionKrw: rep.tuition_krw,
              tuitionLabel: tuitionSourceLabel(rep.tuition_source),
            }
          : null,
      };
    });

    return { data, meta: buildPageMeta(total, dto.page, dto.size) };
  }

  /** GET /academies/:id — 상세(반·버스·cohort·provenance 포함). */
  async detail(id: string) {
    const a = await this.prisma.academy.findFirst({
      where: { id, active: true },
      include: {
        classes: { where: { active: true }, orderBy: [{ subject: 'asc' }, { tuition_krw: 'asc' }] },
        bus_routes: {
          where: { active: true },
          include: { stops: { orderBy: { seq: 'asc' } } },
        },
        cohort_stats: { orderBy: { period: 'desc' } },
      },
    });
    if (!a) throw new NotFoundException('학원을 찾을 수 없습니다.');

    return {
      id: a.id,
      name: a.name,
      addr: a.addr,
      dongCode: a.dong_code,
      phone: a.phone,
      source: a.source,
      sourceLabel: academySourceLabel(a.source),
      claimStatus: a.claim_status,
      nearestStation: a.nearest_station ?? null,
      classes: a.classes.map((c) => ({
        id: c.id,
        subject: c.subject,
        targetGrades: c.target_grades,
        level: c.level,
        schedule: c.schedule,
        capacity: c.capacity,
        tuitionKrw: c.tuition_krw,
        tuitionSource: c.tuition_source,
        tuitionLabel: tuitionSourceLabel(c.tuition_source),
        entryTest: c.entry_test,
      })),
      busRoutes: a.bus_routes.map((r) => ({
        id: r.id,
        name: r.name,
        days: r.days,
        direction: r.direction,
        stops: r.stops.map((s) => ({
          seq: s.seq,
          name: s.name,
          dongCode: s.dong_code,
          timeHint: s.time_hint,
        })),
      })),
      // 재원생 통계 — %/집계만. 개별 데이터 미노출(§4). verified 는 n명 기준 라벨.
      cohortStats: a.cohort_stats.map((cs) => ({
        kind: cs.kind,
        period: cs.period,
        payload: cs.payload_json,
        source: cs.source,
        sourceLabel: cohortSourceLabel(cs.source, cs.n_total),
        nTotal: cs.source === 'verified' ? cs.n_total : null,
      })),
    };
  }
}
