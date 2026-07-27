import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole, BookingStatus, NoteSaveState } from '../../config/enums';
import { consultTypeFromPrisma } from '../../config/prisma-enums';
import { homeroomGap } from './domain/homeroom';
import { NoteDto } from './dto/note.dto';

type NoteRow = {
  id: string;
  booking_id: string;
  student_id: string;
  teacher_id: string;
  consult_type: string | null;
  core_summary: string | null;
  memo: string | null;
  homework: string | null;
  future_dir: string | null;
  guardian_visible: boolean | null;
  save_state: string;
  created_at: Date;
};

/**
 * 상담 기록 (CLAUDE.md §5-5).
 * memo=내부 / coreSummary·homework·futureDir=학생·보호자 공개.
 * 완료(done)는 final 필요(임시 draft 비공개). 보호자 공개는 guardian_visible 게이트.
 */
@Injectable()
export class ConsultationService {
  constructor(private readonly prisma: PrismaService) {}

  /** 선생님이 상담 기록 저장(draft/final). 본인 담당 예약만. */
  async upsert(bookingId: string, dto: NoteDto, user: AuthUser) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException('예약을 찾을 수 없습니다.');
    if (user.role !== AccountRole.TEACHER || booking.teacher_id !== user.id) {
      throw new ForbiddenException(
        '담당 선생님만 상담 기록을 작성할 수 있습니다.',
      );
    }
    const data = {
      student_id: booking.student_id,
      teacher_id: booking.teacher_id,
      consult_type: booking.consult_type,
      sub_type: booking.sub_type,
      core_summary: dto.coreSummary ?? null,
      memo: dto.memo ?? null,
      homework: dto.homework ?? null,
      future_dir: dto.futureDir ?? null,
      guardian_visible: dto.guardianVisible ?? true,
      save_state: dto.saveState,
      author_id: user.id,
      updated_at: new Date(),
    };
    const existing = await this.prisma.consultation_note.findUnique({
      where: { booking_id: bookingId },
    });
    const saved = existing
      ? await this.prisma.consultation_note.update({
          where: { booking_id: bookingId },
          data,
        })
      : await this.prisma.consultation_note.create({
          data: { booking_id: bookingId, ...data },
        });
    return this.maskForViewer(saved, user, booking.student_id);
  }

  async getByBooking(bookingId: string, user: AuthUser) {
    const note = await this.prisma.consultation_note.findUnique({
      where: { booking_id: bookingId },
    });
    if (!note) throw new NotFoundException('상담 기록이 없습니다.');
    await this.assertCanView(note, user);
    return this.maskForViewer(note, user, note.student_id);
  }

  /** 선생님 담당/센터 학생 목록(T6a) — 상담 기록 뷰어 진입. 센터 학생 + 담임 표시. */
  async teacherStudents(user: AuthUser, q?: string) {
    if (user.role !== AccountRole.TEACHER) {
      throw new ForbiddenException('선생님만 조회할 수 있습니다.');
    }
    const teacher = await this.prisma.teacher_profile.findUnique({
      where: { account_id: user.id },
      select: { center_id: true },
    });
    const kw = (q ?? '').trim();
    // 센터가 있으면 센터 학생, 없으면 본인과 예약 이력이 있는 학생으로 제한(무단 전수 열람 방지).
    let where: Record<string, unknown>;
    if (teacher?.center_id) {
      where = { center_id: teacher.center_id };
    } else {
      const ids = (
        await this.prisma.booking.findMany({
          where: { teacher_id: user.id },
          select: { student_id: true },
          distinct: ['student_id'],
        })
      ).map((b) => b.student_id);
      where = { account_id: { in: ids } };
    }
    if (kw) {
      where = {
        ...where,
        account: {
          OR: [
            { name: { contains: kw, mode: 'insensitive' } },
            { login_id: { contains: kw, mode: 'insensitive' } },
          ],
        },
      };
    }
    const rows = await this.prisma.student_profile.findMany({
      where,
      select: {
        account_id: true,
        total_consult: true,
        homeroom_teacher_id: true,
        account: { select: { name: true, login_id: true } },
      },
      orderBy: { account: { name: 'asc' } },
      take: 200,
    });
    return rows.map((s) => ({
      studentId: s.account_id,
      name: s.account?.name ?? '학생',
      loginId: s.account?.login_id ?? null,
      totalConsult: s.total_consult ?? 0,
      isHomeroom: s.homeroom_teacher_id === user.id,
    }));
  }

  /** 학생별 상담 기록 목록. 보호자는 final + guardian_visible 만. */
  async listForStudent(studentId: string, user: AuthUser) {
    await this.assertStudentAccess(studentId, user);
    const isGuardianOrStudent =
      user.role === AccountRole.GUARDIAN || user.role === AccountRole.STUDENT;
    const notes = await this.prisma.consultation_note.findMany({
      where: {
        student_id: studentId,
        // 학생·보호자에게는 final 만 공개(draft 비공개)
        ...(isGuardianOrStudent ? { save_state: NoteSaveState.FINAL } : {}),
        ...(user.role === AccountRole.GUARDIAN
          ? { guardian_visible: true }
          : {}),
        // 교사: 본인 담당분(임시 포함) + 소속 범위 타 교사 기록(final 만) — 타 교사 메모는 마스킹(§5-5, T6f)
        ...(user.role === AccountRole.TEACHER
          ? {
              OR: [
                { teacher_id: user.id },
                { save_state: NoteSaveState.FINAL },
              ],
            }
          : {}),
      },
      include: { teacher_profile: { include: { account: { select: { name: true } } } } },
      orderBy: { created_at: 'desc' },
    });
    return notes.map((n) => this.maskForViewer(n as NoteRow, user, studentId));
  }

  /**
   * T6 뷰어 필터용 개요: 담임 공백 플래그 + 거부 이력(§4 원천 데이터 노출).
   * 권한은 assertStudentAccess 재사용(센터관리자=자기 센터). 선생님은 본인 담당 거부만.
   */
  async recordOverview(studentId: string, user: AuthUser, now = new Date()) {
    await this.assertStudentAccess(studentId, user);
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: studentId },
      select: {
        center_id: true,
        last_homeroom_at: true,
        homeroom_teacher_id: true,
      },
    });
    if (!sp) throw new NotFoundException('학생을 찾을 수 없습니다.');

    const policy = sp.center_id
      ? await this.prisma.consultation_policy.findUnique({
          where: { center_id: sp.center_id },
        })
      : null;
    const gap = homeroomGap(
      sp.last_homeroom_at,
      {
        cycleDays: policy?.homeroom_cycle_days ?? null,
        warnDays: policy?.warn_days ?? null,
        dangerDays: policy?.danger_days ?? null,
      },
      now,
    );

    // 거부 이력: 선생님은 본인 담당분만(§D 뷰어 범위)
    const teacherScope =
      user.role === AccountRole.TEACHER ? { teacher_id: user.id } : {};
    const [rejections, noshowCount] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          student_id: studentId,
          status: BookingStatus.REJECTED,
          ...teacherScope,
        },
        select: {
          id: true,
          teacher_id: true,
          consult_type: true,
          start_at: true,
          created_at: true,
          teacher_profile: { select: { account: { select: { name: true } } } },
        },
        orderBy: { created_at: 'desc' },
        take: 100,
      }),
      this.prisma.booking.count({
        where: {
          student_id: studentId,
          status: BookingStatus.NOSHOW,
          ...teacherScope,
        },
      }),
    ]);

    return {
      studentId,
      homeroomTeacherId: sp.homeroom_teacher_id,
      homeroomGap: gap,
      rejections: rejections.map((b) => ({
        bookingId: b.id,
        teacherId: b.teacher_id,
        teacherName: b.teacher_profile?.account?.name ?? null,
        consultType: consultTypeFromPrisma(b.consult_type),
        startAt: b.start_at,
        createdAt: b.created_at,
      })),
      rejectCount: rejections.length,
      noshowCount,
    };
  }

  // ── 권한 ──
  private async assertCanView(note: NoteRow, user: AuthUser) {
    if (user.role === AccountRole.ADMIN || user.role === AccountRole.HR) return;
    if (user.role === AccountRole.TEACHER && note.teacher_id === user.id)
      return;
    if (user.role === AccountRole.STUDENT && note.student_id === user.id) {
      if (note.save_state !== NoteSaveState.FINAL)
        throw new ForbiddenException('아직 공개되지 않은 기록입니다.');
      return;
    }
    if (user.role === AccountRole.GUARDIAN) {
      await this.assertGuardianLink(user.id, note.student_id);
      if (
        note.save_state !== NoteSaveState.FINAL ||
        note.guardian_visible === false
      ) {
        throw new ForbiddenException('보호자에게 공개되지 않은 기록입니다.');
      }
      return;
    }
    throw new ForbiddenException('상담 기록 열람 권한이 없습니다.');
  }

  private async assertStudentAccess(studentId: string, user: AuthUser) {
    if (user.role === AccountRole.ADMIN || user.role === AccountRole.HR) {
      // 센터 관리자(centerId 보유)는 자기 센터 학생만. 본사/마스터(centerId null)는 전체.
      if (user.centerId) {
        const sp = await this.prisma.student_profile.findUnique({
          where: { account_id: studentId },
          select: { center_id: true },
        });
        if (sp?.center_id !== user.centerId)
          throw new ForbiddenException('다른 센터 학생은 열람할 수 없습니다.');
      }
      return;
    }
    if (user.role === AccountRole.STUDENT && user.id === studentId) return;
    if (user.role === AccountRole.TEACHER) {
      // 소속 센터 학생만(센터 없으면 담당 예약 이력이 있는 학생만) — teacherStudents 와 동일 경계.
      // 이 스코프 검사가 없으면 listForStudent 의 save_state=FINAL 분기가 전 센터 학생 기록을 노출(BOLA).
      const teacher = await this.prisma.teacher_profile.findUnique({
        where: { account_id: user.id },
        select: { center_id: true },
      });
      if (teacher?.center_id) {
        const sp = await this.prisma.student_profile.findUnique({
          where: { account_id: studentId },
          select: { center_id: true },
        });
        if (sp?.center_id !== teacher.center_id)
          throw new ForbiddenException('다른 센터 학생은 열람할 수 없습니다.');
      } else {
        const seen = await this.prisma.booking.findFirst({
          where: { teacher_id: user.id, student_id: studentId },
          select: { id: true },
        });
        if (!seen)
          throw new ForbiddenException('담당 이력이 없는 학생은 열람할 수 없습니다.');
      }
      return;
    }
    if (user.role === AccountRole.GUARDIAN) {
      await this.assertGuardianLink(user.id, studentId);
      return;
    }
    throw new ForbiddenException('열람 권한이 없습니다.');
  }

  private async assertGuardianLink(guardianId: string, studentId: string) {
    const link = await this.prisma.guardian_student_link.findFirst({
      where: {
        guardian_id: guardianId,
        student_id: studentId,
        status: 'approved',
      },
    });
    if (!link) throw new ForbiddenException('연결된 자녀가 아닙니다.');
  }

  /** §5-5 마스킹: memo 는 내부(관리자/HR/작성 교사)만 — 타 교사·학생·보호자에게는 제외(T6f). */
  private maskForViewer(note: NoteRow, user: AuthUser, _studentId: string) {
    const isAuthorTeacher =
      user.role === AccountRole.TEACHER && note.teacher_id === user.id;
    const memoVisible =
      user.role === AccountRole.ADMIN ||
      user.role === AccountRole.HR ||
      isAuthorTeacher;
    const rel = note as unknown as {
      teacher_profile?: { account?: { name?: string } };
    };
    return {
      bookingId: note.booking_id,
      studentId: note.student_id,
      teacherId: note.teacher_id,
      teacherName: rel.teacher_profile?.account?.name ?? null,
      isMine: isAuthorTeacher,
      consultType: consultTypeFromPrisma(note.consult_type),
      coreSummary: note.core_summary,
      homework: note.homework,
      futureDir: note.future_dir,
      ...(memoVisible ? { memo: note.memo } : {}), // 작성 교사·관리자만 내부 메모 열람
      guardianVisible: note.guardian_visible,
      saveState: note.save_state,
      createdAt: note.created_at,
    };
  }
}
