import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

/** 강좌 v1 — 카탈로그 조회·수강신청·내 수강. 데모 강좌(합성)로 실동작. */
@Injectable()
export class LectureService {
  constructor(private readonly prisma: PrismaService) {}

  /** 카탈로그 — 활성 강좌(과목 필터) + 내 수강 여부. */
  async catalog(user: AuthUser, subject?: string) {
    const lectures = await this.prisma.lecture.findMany({
      where: { active: true, ...(subject ? { subject } : {}) },
      orderBy: { created_at: 'desc' }, take: 100,
    });
    const enrolled = new Set(
      (await this.prisma.lecture_enrollment.findMany({ where: { student_id: user.id }, select: { lecture_id: true } })).map((e) => e.lecture_id),
    );
    return lectures.map((l) => ({
      id: l.id, subject: l.subject, unit: l.unit, title: l.title, summary: l.summary, level: l.level, minutes: l.minutes,
      enrolled: enrolled.has(l.id),
    }));
  }

  /** 수강신청(학생·중복 방지). */
  async enroll(user: AuthUser, lectureId: string) {
    if (user.role !== AccountRole.STUDENT) throw new ForbiddenException('학생만 수강신청할 수 있습니다.');
    const lecture = await this.prisma.lecture.findUnique({ where: { id: lectureId } });
    if (!lecture || !lecture.active) throw new NotFoundException('강좌를 찾을 수 없습니다.');
    try {
      await this.prisma.lecture_enrollment.create({ data: { lecture_id: lectureId, student_id: user.id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('이미 수강 중인 강좌입니다.');
      throw e;
    }
    return { ok: true, lectureId };
  }

  /** 내 수강 목록(학생). */
  async myEnrollments(user: AuthUser) {
    const rows = await this.prisma.lecture_enrollment.findMany({
      where: { student_id: user.id }, orderBy: { created_at: 'desc' },
      include: { lecture: true },
    });
    return rows.map((r) => ({
      id: r.lecture.id, subject: r.lecture.subject, unit: r.lecture.unit, title: r.lecture.title,
      summary: r.lecture.summary, level: r.lecture.level, minutes: r.lecture.minutes, enrolledAt: r.created_at,
    }));
  }
}
