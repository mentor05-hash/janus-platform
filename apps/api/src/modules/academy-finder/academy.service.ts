import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPageMeta } from '../../common/dto/pagination.dto';
import type { AcademySearchDto } from './dto/academy-search.dto';
import {
  academySourceLabel,
  cohortSourceLabel,
  tuitionSourceLabel,
} from './provenance';
import { bestClassFitRatio, classFitRatio, scoreAcademy } from './scoring';

type ClassRow = { subject: string; level: string; target_grades: string[]; tuition_krw: number | null; tuition_source: string; schedule: Prisma.JsonValue };
type FilterReq = { subject?: string; level?: string; grade?: string };

/**
 * 학원찾기 조회 — 세션 2: 검색(과목·학년·레벨·통학·수강료·요일) + §5 스코어 정렬.
 * 정산·매칭 점수와 무관한 읽기 도메인. 이용자 집 주소·좌표는 저장/질의하지 않는다(§4).
 */
@Injectable()
export class AcademyService {
  private readonly logger = new Logger(AcademyService.name);
  /** 스코어 정렬을 위해 JS 로 채점하는 후보 상한. 초과분은 meta.capped 로 고지(무단 절단 금지). */
  private static readonly CANDIDATE_CAP = 300;

  constructor(private readonly prisma: PrismaService) {}

  /** class.schedule([{dow,...}]) 에 요일 포함 여부. jsonb 는 JS 로 판정(부분 매칭). */
  private classHasDay(schedule: Prisma.JsonValue, day: string): boolean {
    if (!Array.isArray(schedule)) return false;
    return schedule.some((sl) => sl && typeof sl === 'object' && !Array.isArray(sl) && (sl as Record<string, unknown>).dow === day);
  }

  /** 한 반이 요청 클래스 필터(과목·레벨·학년·수강료·요일)를 모두 만족하는가. */
  private classMatches(c: ClassRow, dto: AcademySearchDto): boolean {
    if (dto.subject && c.subject !== dto.subject) return false;
    if (dto.level && c.level !== dto.level) return false;
    if (dto.grade && !c.target_grades.includes(dto.grade)) return false;
    if (dto.tuitionMax != null && !(c.tuition_krw != null && c.tuition_krw <= dto.tuitionMax)) return false;
    if (dto.day && !this.classHasDay(c.schedule, dto.day)) return false;
    return true;
  }

  /** GET /academies — 카드 리스트(필터·§5 스코어 정렬·페이지네이션). */
  async search(dto: AcademySearchDto) {
    const req: FilterReq = { subject: dto.subject, level: dto.level, grade: dto.grade };
    const hasClassFilter = !!(dto.subject || dto.level || dto.grade || dto.tuitionMax != null || dto.day);
    const busOnly = dto.busOnly === 'true' && !!dto.dong;

    // 1) 코스 프리필터(WHERE, 인덱스 활용) — 이름·과목·버스경유. 정밀 반 매칭은 JS.
    const where: Prisma.academyWhereInput = { active: true };
    if (dto.q) where.name = { contains: dto.q, mode: 'insensitive' };
    if (dto.subject) where.classes = { some: { active: true, subject: dto.subject } };
    if (busOnly) where.bus_routes = { some: { active: true, stops: { some: { dong_code: dto.dong } } } };

    // 2) 후보 로드(신선도 순, 상한). 정밀 필터·채점은 JS.
    const candidates = await this.prisma.academy.findMany({
      where,
      orderBy: [{ updated_at: 'desc' }],
      take: AcademyService.CANDIDATE_CAP,
      include: {
        classes: { where: { active: true } },
        cohort_stats: { where: { source: 'verified' }, take: 1 },
        bus_routes: {
          where: { active: true },
          include: { stops: dto.dong ? { where: { dong_code: dto.dong } } : { take: 0 } },
        },
      },
    });
    const capped = candidates.length >= AcademyService.CANDIDATE_CAP;
    if (capped) this.logger.warn(`후보 상한(${AcademyService.CANDIDATE_CAP}) 도달 — 일부 결과가 채점 대상에서 제외될 수 있음(meta.capped).`);

    const now = Date.now();
    // 3) 정밀 필터 + 채점.
    const scored = candidates
      .map((a) => {
        const matchingClasses = hasClassFilter ? a.classes.filter((c) => this.classMatches(c, dto)) : a.classes;
        if (hasClassFilter && matchingClasses.length === 0) return null; // 요청 필터 불충족 → 제외
        const busPass = !!dto.dong && a.bus_routes.some((r) => r.stops.length > 0);
        const walkMin = this.walkMin(a.nearest_station);
        const verified = a.cohort_stats.length > 0;
        const ageDays = Math.max(0, Math.floor((now - new Date(a.updated_at).getTime()) / 86_400_000));
        const score = scoreAcademy({ bestClassFitRatio: bestClassFitRatio(a.classes, req), busPass, walkMin, verified, ageDays });
        // 대표 반: 매칭 반 중 적합도 최고 → 저렴 순.
        const rep = [...matchingClasses].sort((x, y) => classFitRatio(y, req) - classFitRatio(x, req) || (x.tuition_krw ?? Infinity) - (y.tuition_krw ?? Infinity))[0];
        return { a, busPass, verified, score, rep };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // 4) 정렬.
    scored.sort((p, q) => {
      if (dto.sort === 'tuition') return (p.rep?.tuition_krw ?? Infinity) - (q.rep?.tuition_krw ?? Infinity);
      if (dto.sort === 'fresh') return new Date(q.a.updated_at).getTime() - new Date(p.a.updated_at).getTime();
      return q.score - p.score || new Date(q.a.updated_at).getTime() - new Date(p.a.updated_at).getTime(); // 기본 score
    });

    // 5) 페이지네이션(JS slice).
    const total = scored.length;
    const pageRows = scored.slice((dto.page - 1) * dto.size, (dto.page - 1) * dto.size + dto.size);
    const data = pageRows.map(({ a, busPass, verified, score, rep }) => ({
      id: a.id,
      name: a.name,
      addr: a.addr,
      dongCode: a.dong_code,
      source: a.source,
      sourceLabel: academySourceLabel(a.source),
      nearestStation: a.nearest_station ?? null,
      verified,
      busPass,
      score,
      repClass: rep
        ? { subject: rep.subject, level: rep.level, tuitionKrw: rep.tuition_krw, tuitionLabel: tuitionSourceLabel(rep.tuition_source) }
        : null,
    }));

    return { data, meta: { ...buildPageMeta(total, dto.page, dto.size), sort: dto.sort ?? 'score', capped } };
  }

  /** nearest_station JSON 에서 도보 분 추출(없으면 null). */
  private walkMin(nearest: Prisma.JsonValue): number | null {
    if (!nearest || typeof nearest !== 'object' || Array.isArray(nearest)) return null;
    const w = (nearest as Record<string, unknown>).walk_min;
    return typeof w === 'number' ? w : null;
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
