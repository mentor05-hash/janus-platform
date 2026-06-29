import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPageMeta } from '../../common/dto/pagination.dto';
import { TeacherQueryDto } from './dto/teacher-query.dto';

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
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.teacher_profile.findMany({
        where,
        skip: (q.page - 1) * q.size,
        take: q.size,
        include: { account: { select: { name: true, center_id: true } } },
        orderBy: [{ grade: 'asc' }, { rating: 'desc' }],
      }),
      this.prisma.teacher_profile.count({ where }),
    ]);
    return {
      data: rows.map((t) => this.toTeacherCard(t)),
      meta: buildPageMeta(total, q.page, q.size),
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
