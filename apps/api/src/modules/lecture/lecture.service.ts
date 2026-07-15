import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole } from '../../config/enums';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

/** 강좌 v1 — 카탈로그 조회·수강신청·내 수강. 데모 강좌(합성)로 실동작. */
@Injectable()
export class LectureService {
  constructor(private readonly prisma: PrismaService) {}

  /** 카탈로그 — 활성 강좌(과목·검색 필터) + 내 수강 여부. */
  async catalog(user: AuthUser, subject?: string, q?: string) {
    const term = (q ?? '').trim();
    const lectures = await this.prisma.lecture.findMany({
      where: {
        active: true, ...(subject ? { subject } : {}),
        ...(term ? { OR: [{ title: { contains: term, mode: 'insensitive' } }, { summary: { contains: term, mode: 'insensitive' } }, { unit: { contains: term, mode: 'insensitive' } }] } : {}),
      },
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

  /** 강좌 등록(교사). */
  async create(user: AuthUser, dto: { subject: string; unit?: string; title: string; summary?: string; level?: string; minutes?: number }) {
    if (user.role !== AccountRole.TEACHER) throw new ForbiddenException('선생님만 강좌를 등록할 수 있습니다.');
    const l = await this.prisma.lecture.create({
      data: {
        teacher_id: user.id, subject: dto.subject, unit: dto.unit ?? null, title: dto.title,
        summary: dto.summary ?? null, level: dto.level ?? null, minutes: dto.minutes ?? null,
      },
    });
    return { id: l.id };
  }

  /** 내가 등록한 강좌(교사) — 수강 인원 포함. */
  async teacherLectures(user: AuthUser) {
    if (user.role !== AccountRole.TEACHER) throw new ForbiddenException('선생님만 조회할 수 있습니다.');
    const rows = await this.prisma.lecture.findMany({ where: { teacher_id: user.id }, orderBy: { created_at: 'desc' } });
    const ids = rows.map((r) => r.id);
    const counts = ids.length ? await this.prisma.lecture_enrollment.groupBy({ by: ['lecture_id'], where: { lecture_id: { in: ids } }, _count: { _all: true } }) : [];
    const cmap = new Map(counts.map((c) => [c.lecture_id, c._count._all]));
    return rows.map((l) => ({
      id: l.id, subject: l.subject, unit: l.unit, title: l.title, summary: l.summary, level: l.level, minutes: l.minutes,
      active: l.active, enrolled: cmap.get(l.id) ?? 0, createdAt: l.created_at,
    }));
  }

  /** 강좌 활성/비활성 토글(교사·본인 강좌). */
  async setActive(user: AuthUser, lectureId: string, active: boolean) {
    const l = await this.prisma.lecture.findUnique({ where: { id: lectureId } });
    if (!l || l.teacher_id !== user.id) throw new ForbiddenException('본인 강좌만 수정할 수 있습니다.');
    await this.prisma.lecture.update({ where: { id: lectureId }, data: { active } });
    return { id: lectureId, active };
  }

  /** 강좌 상세 + 내 수강/진도 + 평점(학생). */
  async detail(user: AuthUser, lectureId: string) {
    const l = await this.prisma.lecture.findUnique({ where: { id: lectureId } });
    if (!l || !l.active) throw new NotFoundException('강좌를 찾을 수 없습니다.');
    const [enr, ragg, myReview] = await Promise.all([
      this.prisma.lecture_enrollment.findUnique({ where: { lecture_id_student_id: { lecture_id: lectureId, student_id: user.id } } }),
      this.prisma.lecture_review.aggregate({ where: { lecture_id: lectureId }, _avg: { rating: true }, _count: { _all: true } }),
      this.prisma.lecture_review.findUnique({ where: { lecture_id_student_id: { lecture_id: lectureId, student_id: user.id } } }),
    ]);
    return {
      id: l.id, subject: l.subject, unit: l.unit, title: l.title, summary: l.summary, level: l.level, minutes: l.minutes,
      videoUrl: l.video_url, enrolled: !!enr, progress: enr?.progress ?? 0,
      rating: ragg._avg.rating ? Math.round(ragg._avg.rating * 10) / 10 : null, reviewCount: ragg._count._all,
      myRating: myReview?.rating ?? null,
    };
  }

  /** 후기 목록(공개). */
  async reviews(lectureId: string) {
    const rows = await this.prisma.lecture_review.findMany({ where: { lecture_id: lectureId }, orderBy: { created_at: 'desc' }, take: 50 });
    const ids = [...new Set(rows.map((r) => r.student_id))];
    const accs = ids.length ? await this.prisma.account.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const nm = new Map(accs.map((a) => [a.id, a.name]));
    return rows.map((r) => ({ id: r.id, rating: r.rating, text: r.text, name: nm.get(r.student_id) ?? '익명', createdAt: r.created_at }));
  }

  /** 후기 작성(수강생·진도 있는·강좌별 1회, 재작성 시 갱신). */
  async review(user: AuthUser, lectureId: string, rating: number, text?: string) {
    if (user.role !== AccountRole.STUDENT) throw new ForbiddenException('학생만 후기를 남길 수 있습니다.');
    const enr = await this.prisma.lecture_enrollment.findUnique({ where: { lecture_id_student_id: { lecture_id: lectureId, student_id: user.id } } });
    if (!enr) throw new ForbiddenException('수강한 강좌만 후기를 남길 수 있습니다.');
    if (rating < 1 || rating > 5) throw new BadRequestException('평점은 1~5 입니다.');
    await this.prisma.lecture_review.upsert({
      where: { lecture_id_student_id: { lecture_id: lectureId, student_id: user.id } },
      create: { lecture_id: lectureId, student_id: user.id, rating, text: text ?? null },
      update: { rating, text: text ?? null },
    });
    return { ok: true };
  }

  /** 수강 진도 업데이트(학생·수강 중). 0~100. */
  async updateProgress(user: AuthUser, lectureId: string, progress: number) {
    const enr = await this.prisma.lecture_enrollment.findUnique({ where: { lecture_id_student_id: { lecture_id: lectureId, student_id: user.id } } });
    if (!enr) throw new NotFoundException('수강 중인 강좌가 아닙니다.');
    const p = Math.max(0, Math.min(100, Math.round(progress)));
    await this.prisma.lecture_enrollment.update({ where: { id: enr.id }, data: { progress: p, last_at: new Date() } });
    return { id: lectureId, progress: p };
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
