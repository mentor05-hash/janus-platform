import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * 교사 차단 (CLAUDE.md §6 Phase 3). 학생이 차단한 교사는 매칭·예약에서 제외.
 */
@Injectable()
export class BlockService {
  constructor(private readonly prisma: PrismaService) {}

  async block(student: AuthUser, teacherId: string) {
    const teacher = await this.prisma.teacher_profile.findUnique({
      where: { account_id: teacherId },
    });
    if (!teacher) throw new NotFoundException('선생님을 찾을 수 없습니다.');
    await this.prisma.teacher_block.upsert({
      where: {
        student_id_teacher_id: {
          student_id: student.id,
          teacher_id: teacherId,
        },
      },
      update: {},
      create: { student_id: student.id, teacher_id: teacherId },
    });
    return { teacherId, blocked: true };
  }

  async unblock(student: AuthUser, teacherId: string) {
    await this.prisma.teacher_block.deleteMany({
      where: { student_id: student.id, teacher_id: teacherId },
    });
    return { teacherId, blocked: false };
  }

  async list(student: AuthUser) {
    const rows = await this.prisma.teacher_block.findMany({
      where: { student_id: student.id },
    });
    return rows.map((r) => r.teacher_id);
  }

  /** 학생이 차단한 교사 id 집합(매칭/예약 제외용). */
  async blockedTeacherIds(studentId: string): Promise<string[]> {
    const rows = await this.prisma.teacher_block.findMany({
      where: { student_id: studentId },
      select: { teacher_id: true },
    });
    return rows.map((r) => r.teacher_id);
  }
}
