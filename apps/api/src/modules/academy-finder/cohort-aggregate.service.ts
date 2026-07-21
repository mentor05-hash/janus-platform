import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { VERIFIED_MIN_N, kAnonSchoolDist, toBandPercent } from './cohort-agg';

/**
 * 재원생 분기 집계(verified) — 스펙 §3·§4. 동의한 재원생만 집계, k-익명(n≥5) 강제,
 * 개별 데이터는 저장하지 않는다(분포 %/기타 합산만). 정산·매칭과 무관.
 */
@Injectable()
export class CohortAggregateService {
  private readonly logger = new Logger(CohortAggregateService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 현재 분기 문자열(예: 2026Q3). */
  currentPeriod(now = new Date()): string {
    const q = Math.floor(now.getUTCMonth() / 3) + 1;
    return `${now.getUTCFullYear()}Q${q}`;
  }

  /** 분기 집계 잡 — 매 분기 첫날 03:00 UTC. (내부 잡: §6) */
  @Cron('0 3 1 1,4,7,10 *')
  async quarterlyJob() {
    const period = this.currentPeriod();
    this.logger.log(`분기 재원생 집계 시작 period=${period}`);
    const r = await this.aggregateAll(period);
    this.logger.log(`분기 집계 완료 period=${period} 학원=${r.academies} 생성=${r.created} 미달=${r.skipped}`);
  }

  /** 전 학원 집계(동의 재원생 ≥1 인 학원만 대상). */
  async aggregateAll(period: string) {
    const academyIds = await this.prisma.academy_enrollment.findMany({
      where: { status: 'self_reported', consent_stats: true },
      distinct: ['academy_id'],
      select: { academy_id: true },
    });
    let created = 0;
    let skipped = 0;
    for (const { academy_id } of academyIds) {
      const res = await this.aggregateOne(academy_id, period);
      if (res.created) created += 1; else skipped += 1;
    }
    return { academies: academyIds.length, created, skipped, period };
  }

  /**
   * 한 학원 집계. 동의 재원 n<VERIFIED_MIN_N 이면 verified cohort 미생성(+기존 삭제).
   * grade_band: 최신 score_report 등급 → 밴드 %. school_dist: enrollment.school k-익명.
   */
  async aggregateOne(academyId: string, period: string): Promise<{ created: boolean; nTotal: number }> {
    const enrollments = await this.prisma.academy_enrollment.findMany({
      where: { academy_id: academyId, status: 'self_reported', consent_stats: true },
      select: { user_id: true, school: true },
    });
    const nTotal = enrollments.length;

    // k-익명 게이트: 미달이면 이 학원의 verified cohort(해당 period) 제거하고 종료.
    if (nTotal < VERIFIED_MIN_N) {
      await this.prisma.cohort_stat.deleteMany({ where: { academy_id: academyId, period, source: 'verified' } });
      return { created: false, nTotal };
    }

    // grade_band — 학생별 대표 등급(최신 report 의 등급 평균 반올림)으로 분포 %.
    const grades = await this.repGrades(enrollments.map((e) => e.user_id));
    const bandPct = toBandPercent(grades);

    // school_dist — 자기신고 학교명 k-익명(n<5 기타 합산).
    const schoolDist = kAnonSchoolDist(enrollments.map((e) => e.school));

    if (Object.keys(bandPct).length > 0) {
      await this.upsertVerified(academyId, 'grade_band', period, { 내신: bandPct }, nTotal);
    }
    if (schoolDist.length > 0) {
      await this.upsertVerified(academyId, 'school_dist', period, schoolDist, nTotal);
    }
    return { created: true, nTotal };
  }

  /** 학생 id 배열 → 각 학생 대표 등급(최신 report 등급 평균). 개별 값은 반환만 하고 저장 안 함. */
  private async repGrades(studentIds: string[]): Promise<number[]> {
    const out: number[] = [];
    for (const sid of studentIds) {
      const report = await this.prisma.score_report.findFirst({
        where: { student_id: sid },
        orderBy: { period: 'desc' },
        include: { items: { select: { grade: true } } },
      });
      if (!report) continue;
      const nums = report.items.map((i) => Number(i.grade)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 9);
      if (nums.length === 0) continue;
      out.push(Math.round(nums.reduce((a, b) => a + b, 0) / nums.length));
    }
    return out;
  }

  private async upsertVerified(academyId: string, kind: string, period: string, payload: unknown, nTotal: number) {
    await this.prisma.cohort_stat.upsert({
      where: { academy_id_kind_period_source: { academy_id: academyId, kind, period, source: 'verified' } },
      create: { academy_id: academyId, kind, period, source: 'verified', n_total: nTotal, payload_json: payload as object },
      update: { n_total: nTotal, payload_json: payload as object, updated_at: new Date() },
    });
  }
}
