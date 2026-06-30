import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CLASSIFY_LIMITS } from '../../config/constants';
import { AccountRole, BookingStatus } from '../../config/enums';
import { canAddWithinLimit } from '../pricing-policy/domain/limit';
import { averageRating, computeGrade } from './domain/grade';
import { ClassifyDto, ReviewDto } from './dto/evaluation.dto';

/**
 * 평가·분류·랭킹 (CLAUDE.md §6 Phase 3, §5-9).
 * 분류(fit/unfit 한쪽만·한도 동결), 리뷰(완료 상담), 평점 집계 → 교사 등급 산정.
 */
@Injectable()
export class EvaluationService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 분류(§5-9) ──
  async myLists(student: AuthUser) {
    const rows = await this.prisma.teacher_list_entry.findMany({
      where: { student_id: student.id },
    });
    return {
      fit: rows.filter((r) => r.list_kind === 'fit').map((r) => r.teacher_id),
      unfit: rows
        .filter((r) => r.list_kind === 'unfit')
        .map((r) => r.teacher_id),
    };
  }

  async classify(student: AuthUser, dto: ClassifyDto) {
    const teacher = await this.prisma.teacher_profile.findUnique({
      where: { account_id: dto.teacherId },
    });
    if (!teacher) throw new NotFoundException('선생님을 찾을 수 없습니다.');

    const existing = await this.prisma.teacher_list_entry.findFirst({
      where: { student_id: student.id, teacher_id: dto.teacherId },
    });
    if (existing) {
      if (existing.list_kind === dto.listKind)
        return { teacherId: dto.teacherId, listKind: dto.listKind };
      // 한 명은 한쪽만(§5-9) — 반대 목록 전환은 먼저 제거 후 재분류
      throw new ConflictException(
        '이미 반대 목록에 분류되어 있습니다. 먼저 제거하세요.',
      );
    }

    // 한도(§5-9: 축소 시 기존 동결·신규만 차단) — limit_policy 우선, 기본값 fallback
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: student.id },
    });
    const lp = sp?.center_id
      ? await this.prisma.limit_policy.findUnique({
          where: { center_id: sp.center_id },
        })
      : null;
    const limit =
      dto.listKind === 'fit'
        ? (lp?.classify_fit_limit ?? CLASSIFY_LIMITS.fit)
        : (lp?.classify_unfit_limit ?? CLASSIFY_LIMITS.unfit);
    const count = await this.prisma.teacher_list_entry.count({
      where: { student_id: student.id, list_kind: dto.listKind },
    });
    if (!canAddWithinLimit(count, limit)) {
      throw new ConflictException(
        `${dto.listKind} 분류 한도(${limit})를 초과했습니다.`,
      );
    }

    await this.prisma.teacher_list_entry.create({
      data: {
        student_id: student.id,
        teacher_id: dto.teacherId,
        list_kind: dto.listKind,
      },
    });
    return { teacherId: dto.teacherId, listKind: dto.listKind };
  }

  async removeClassification(student: AuthUser, teacherId: string) {
    await this.prisma.teacher_list_entry.deleteMany({
      where: { student_id: student.id, teacher_id: teacherId },
    });
    return { teacherId, removed: true };
  }

  // ── 리뷰 + 등급 집계 ──
  async review(bookingId: string, dto: ReviewDto, student: AuthUser) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException('예약을 찾을 수 없습니다.');
    if (
      student.role !== AccountRole.STUDENT ||
      booking.student_id !== student.id
    ) {
      throw new ForbiddenException('본인 상담만 평가할 수 있습니다.');
    }
    if (booking.status !== BookingStatus.DONE) {
      throw new BadRequestException('완료된 상담만 평가할 수 있습니다.');
    }
    const dup = await this.prisma.review.findUnique({
      where: { booking_id: bookingId },
    });
    if (dup) throw new ConflictException('이미 평가한 상담입니다.');

    // 리뷰 생성 + 재집계를 한 트랜잭션에서, teacher_profile 행잠금으로 직렬화(M1 lost-update 방지).
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT account_id FROM teacher_profile WHERE account_id = ${booking.teacher_id}::uuid FOR UPDATE`;
      await tx.review.create({
        data: {
          booking_id: bookingId,
          student_id: booking.student_id,
          teacher_id: booking.teacher_id,
          rating_attitude: dto.ratingAttitude,
          rating_content: dto.ratingContent,
          rating_skill: dto.ratingSkill,
          rating_again: dto.ratingAgain,
          text: dto.text ?? null,
          done_confirmed: dto.doneConfirmed ?? true,
          reported: dto.reported ?? false,
        },
      });
      return this.recomputeTeacher(tx, booking.teacher_id);
    });
  }

  /** 교사 전체 리뷰로 평점·등급 재산정(트랜잭션 내). */
  private async recomputeTeacher(
    tx: Prisma.TransactionClient,
    teacherId: string,
  ) {
    const reviews = await tx.review.findMany({
      where: { teacher_id: teacherId },
    });
    const overalls = reviews.map((r) =>
      averageRating([
        r.rating_attitude,
        r.rating_content,
        r.rating_skill,
        r.rating_again,
      ]),
    );
    const rating = averageRating(overalls);
    const grade = computeGrade(rating, reviews.length);

    // total_consult(완료 상담 수)는 덮어쓰지 않음(M5) — 평점·등급만 갱신.
    await tx.teacher_profile.update({
      where: { account_id: teacherId },
      data: { rating, grade: grade },
    });
    await tx.teacher_grade.upsert({
      where: { teacher_id: teacherId },
      update: { grade: grade },
      create: { teacher_id: teacherId, grade: grade },
    });
    return { teacherId, rating, grade, reviewCount: reviews.length };
  }
}
