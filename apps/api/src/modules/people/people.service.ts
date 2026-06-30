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
    };
    // 랭킹 가중치(§5-7): 등급 우선, 동급은 유효평점(평점 − 취소누적×가중치) 내림차순.
    // 계산 정렬이라 전체 후보를 가져와 JS 정렬 후 페이지네이션(센터 규모상 소량).
    const all = await this.prisma.teacher_profile.findMany({
      where,
      include: { account: { select: { name: true, center_id: true } } },
    });
    const scored = all
      .map((t) => ({
        t,
        score:
          Number(t.rating ?? 0) - (t.cancel_count ?? 0) * RANK_CANCEL_WEIGHT,
      }))
      .sort((a, b) => {
        const g =
          (GRADE_ORDER[a.t.grade ?? 'B'] ?? 9) -
          (GRADE_ORDER[b.t.grade ?? 'B'] ?? 9);
        return g !== 0 ? g : b.score - a.score;
      });
    const page = scored.slice((q.page - 1) * q.size, q.page * q.size);
    return {
      data: page.map((s) => this.toTeacherCard(s.t)),
      meta: buildPageMeta(scored.length, q.page, q.size),
    };
  }

  async getTeacher(id: string) {
    const t = await this.prisma.teacher_profile.findUnique({
      where: { account_id: id },
      include: { account: { select: { name: true, center_id: true } } },
    });
    if (!t) throw new NotFoundException('선생님을 찾을 수 없습니다.');
    return this.toTeacherCard(t);
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
