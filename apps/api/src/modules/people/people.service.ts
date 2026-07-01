import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPageMeta } from '../../common/dto/pagination.dto';
import { RANK_CANCEL_WEIGHT } from '../../config/constants';
import { TeacherQueryDto } from './dto/teacher-query.dto';

const GRADE_ORDER: Record<string, number> = { S: 0, A: 1, B: 2 };

/**
 * People 컨텍스트 — 학생·선생님 프로필 조회 (CLAUDE.md §3).
 * 선생님 공개정보(이름·과목·등급·평점·경력)는 노출. 학생 PII 마스킹은 consultation/응답에서.
 */
@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  async listTeachers(q: TeacherQueryDto) {
    const where = {
      ...(q.grade ? { grade: q.grade } : {}),
      ...(q.category ? { teacher_category: q.category } : {}),
      ...(q.subject ? { subjects: { has: q.subject } } : {}),
      ...(q.consultType ? { consult_types: { has: q.consultType } } : {}),
    };
    // 랭킹 가중치(§5-7): 등급 우선, 동급은 유효평점(평점 − 취소누적×가중치) 내림차순.
    // 계산 정렬이라 전체 후보를 가져와 JS 정렬 후 페이지네이션(센터 규모상 소량).
    let all = await this.prisma.teacher_profile.findMany({
      where,
      include: { account: { select: { name: true, center_id: true } } },
    });
    // 이름·과목 검색(q)
    const kw = q.q?.trim().toLowerCase();
    if (kw) {
      all = all.filter(
        (t) =>
          t.account.name.toLowerCase().includes(kw) ||
          t.subjects.some((s) => s.toLowerCase().includes(kw)) ||
          (t.teacher_category ?? '').toLowerCase().includes(kw),
      );
    }
    // 질문수(답변 수)·오프라인 가능 집계
    const ids = all.map((t) => t.account_id);
    const answers = ids.length
      ? await this.prisma.qna_answer.groupBy({ by: ['teacher_id'], where: { teacher_id: { in: ids } }, _count: { _all: true } })
      : [];
    const offline = ids.length
      ? await this.prisma.teacher_offline_availability.findMany({ where: { teacher_id: { in: ids } }, select: { teacher_id: true } })
      : [];
    const qCount = new Map<string, number>(answers.map((a) => [a.teacher_id, a._count._all]));
    const offlineSet = new Set<string>(offline.map((o) => o.teacher_id));

    // 취소 가중치는 센터별 penalty_policy.ranking_weight_down 정책값에서(없으면 상수 폴백).
    const policies = await this.prisma.penalty_policy.findMany({
      select: { center_id: true, ranking_weight_down: true },
    });
    const weightByCenter = new Map(
      policies.map((pp) => [pp.center_id, pp.ranking_weight_down == null ? RANK_CANCEL_WEIGHT : Number(pp.ranking_weight_down)]),
    );
    const cancelWeight = (centerId: string | null | undefined) =>
      (centerId && weightByCenter.has(centerId) ? weightByCenter.get(centerId)! : RANK_CANCEL_WEIGHT);
    const scored = all.map((t) => ({
      t,
      questionCount: qCount.get(t.account_id) ?? 0,
      offlineAvailable: offlineSet.has(t.account_id),
      score: Number(t.rating ?? 0) - (t.cancel_count ?? 0) * cancelWeight(t.center_id),
    }));
    // 정렬: 지정 소트 우선, 없으면 등급→유효평점(기본 랭킹 §5-7)
    scored.sort((a, b) => {
      switch (q.sort) {
        case 'rating': return Number(b.t.rating ?? 0) - Number(a.t.rating ?? 0);
        case 'consult': return (b.t.total_consult ?? 0) - (a.t.total_consult ?? 0);
        case 'question': return b.questionCount - a.questionCount;
        case 'offline': return Number(b.offlineAvailable) - Number(a.offlineAvailable) || b.score - a.score;
        default: {
          const g = (GRADE_ORDER[a.t.grade ?? 'B'] ?? 9) - (GRADE_ORDER[b.t.grade ?? 'B'] ?? 9);
          return g !== 0 ? g : b.score - a.score;
        }
      }
    });
    const page = scored.slice((q.page - 1) * q.size, q.page * q.size);
    return {
      data: page.map((s) => ({ ...this.toTeacherCard(s.t), questionCount: s.questionCount, offlineAvailable: s.offlineAvailable })),
      meta: buildPageMeta(scored.length, q.page, q.size),
    };
  }

  async getTeacher(id: string) {
    const t = await this.prisma.teacher_profile.findUnique({
      where: { account_id: id },
      include: { account: { select: { name: true, center_id: true } } },
    });
    if (!t) throw new NotFoundException('선생님을 찾을 수 없습니다.');
    return {
      ...this.toTeacherCard(t),
      intro: t.intro ?? null,
      strengths: t.strengths ?? [],
      reRequestRate: t.re_request_rate == null ? null : Number(t.re_request_rate),
      avgResponseMin: t.avg_response_min ?? null,
    };
  }

  /**
   * 선생님 랭킹(이달의 우수 선생님). 만족도·재요청률·누적상담 가중 합산 점수로 정렬.
   * Teachus '리그'와 달리 기관형 인정 지표 — 공개 리더보드.
   */
  async leaderboard(centerId: string | null, limit = 10) {
    const teachers = await this.prisma.teacher_profile.findMany({
      where: centerId ? { center_id: centerId } : {},
      include: { account: { select: { name: true, center_id: true } } },
      take: 300,
    });
    const scored = teachers
      .map((t) => {
        const rating = t.rating == null ? 0 : Number(t.rating);
        const reReq = t.re_request_rate == null ? 0 : Number(t.re_request_rate);
        const consult = t.total_consult ?? 0;
        // 만족도(0~100) + 재요청률(0~100)*0.6 + 누적상담(최대 100점)
        const score =
          rating * 20 + reReq * 0.6 + Math.min(consult, 200) / 2;
        return {
          ...this.toTeacherCard(t),
          strengths: t.strengths ?? [],
          reRequestRate: reReq || null,
          score: Math.round(score * 10) / 10,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((t, i) => ({ ...t, rank: i + 1 }));
    return scored;
  }

  /** 선생님 본인 프로필 편집(소개·강점·과목·경력·직군). */
  async updateMyProfile(
    teacherId: string,
    dto: {
      intro?: string;
      strengths?: string[];
      subjects?: string[];
      career?: string;
      category?: string;
    },
  ) {
    const t = await this.prisma.teacher_profile.findUnique({
      where: { account_id: teacherId },
    });
    if (!t) throw new NotFoundException('선생님 프로필이 없습니다.');
    const updated = await this.prisma.teacher_profile.update({
      where: { account_id: teacherId },
      data: {
        ...(dto.intro !== undefined ? { intro: dto.intro } : {}),
        ...(dto.strengths !== undefined ? { strengths: dto.strengths } : {}),
        ...(dto.subjects !== undefined ? { subjects: dto.subjects } : {}),
        ...(dto.career !== undefined ? { career: dto.career } : {}),
        ...(dto.category !== undefined ? { teacher_category: dto.category } : {}),
      },
      include: { account: { select: { name: true, center_id: true } } },
    });
    return {
      ...this.toTeacherCard(updated),
      intro: updated.intro ?? null,
      strengths: updated.strengths ?? [],
    };
  }

  /**
   * 니즈 기반 선생님 추천(§matching 보강). 학생의 과목·강점 태그와
   * 선생님 subjects·strengths 교집합 점수 + 평점·상담수로 정렬. 차단 교사 제외.
   */
  async recommend(
    studentId: string,
    centerId: string | null,
    dto: { subject?: string; needs?: string[] },
  ) {
    const blocked = (
      await this.prisma.teacher_block.findMany({
        where: { student_id: studentId },
        select: { teacher_id: true },
      })
    ).map((b) => b.teacher_id);
    const teachers = await this.prisma.teacher_profile.findMany({
      where: {
        ...(centerId ? { center_id: centerId } : {}),
        ...(blocked.length ? { account_id: { notIn: blocked } } : {}),
      },
      include: { account: { select: { name: true, center_id: true } } },
      take: 300,
    });
    const needs = (dto.needs ?? []).map((n) => n.trim()).filter(Boolean);
    const scored = teachers
      .map((t) => {
        const subjectHit = dto.subject && t.subjects.includes(dto.subject) ? 3 : 0;
        const strengthHits = needs.filter((n) =>
          (t.strengths ?? []).some((s) => s.includes(n) || n.includes(s)),
        ).length;
        const rating = t.rating == null ? 0 : Number(t.rating);
        const gradeBoost = t.grade === 'S' ? 1.5 : t.grade === 'A' ? 0.8 : 0;
        const score =
          subjectHit + strengthHits * 2 + rating + gradeBoost + (t.total_consult ?? 0) / 500;
        return {
          ...this.toTeacherCard(t),
          intro: t.intro ?? null,
          strengths: t.strengths ?? [],
          matchScore: Math.round(score * 10) / 10,
          matchedNeeds: needs.filter((n) =>
            (t.strengths ?? []).some((s) => s.includes(n) || n.includes(s)),
          ),
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 12);
    return scored;
  }

  private toTeacherCard(t: {
    account_id: string;
    subjects: string[];
    sub_subjects: string[];
    grade: string;
    career: string | null;
    rating: unknown;
    total_consult: number | null;
    teacher_category: string | null;
    account: { name: string; center_id: string | null };
  }) {
    return {
      id: t.account_id,
      name: t.account.name,
      centerId: t.account.center_id,
      subjects: t.subjects,
      subSubjects: t.sub_subjects,
      grade: t.grade,
      category: t.teacher_category,
      career: t.career,
      rating: t.rating == null ? null : Number(t.rating),
      totalConsult: t.total_consult ?? 0,
    };
  }
}
