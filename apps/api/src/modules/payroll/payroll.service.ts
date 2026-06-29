import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole, BookingStatus } from '../../config/enums';
import { computePayroll, PayrollRates } from './domain/payroll';

/**
 * 예상급여 (CLAUDE.md §payroll). 확정분(완료)+예상분(예정). 단가는 정책 또는 ENV(O20).
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async estimate(teacherId: string, actor: AuthUser) {
    // 권한: 본인(선생님) 또는 관리자/HR
    const isSelf = actor.role === AccountRole.TEACHER && actor.id === teacherId;
    const isAdmin = actor.role === AccountRole.ADMIN || actor.role === AccountRole.HR;
    if (!isSelf && !isAdmin) throw new ForbiddenException('급여 조회 권한이 없습니다.');

    const teacher = await this.prisma.teacher_profile.findUnique({ where: { account_id: teacherId } });
    if (!teacher) throw new NotFoundException('선생님을 찾을 수 없습니다.');

    const [doneCount, upcomingCount, qnaAcceptedCount] = await Promise.all([
      this.prisma.booking.count({ where: { teacher_id: teacherId, status: BookingStatus.DONE as never } }),
      this.prisma.booking.count({ where: { teacher_id: teacherId, status: BookingStatus.CONFIRMED as never } }),
      this.prisma.qna_answer.count({ where: { teacher_id: teacherId, accepted: true } }),
    ]);

    const rates = await this.resolveRates(teacher.center_id, teacher.teacher_category);
    const result = computePayroll({ doneCount, upcomingCount, qnaAcceptedCount }, rates);

    return { teacherId, ...result };
  }

  /** payroll_policy 우선, 없으면 ENV 기본값(미결정 단가 O20). */
  private async resolveRates(centerId: string | null, category: string | null): Promise<PayrollRates> {
    const policy = await this.prisma.payroll_policy.findFirst({
      where: { center_id: centerId, ...(category ? { teacher_category: category } : {}) },
    });
    const envNum = (key: string, fallback: number) => Number(this.config.get(key) ?? fallback);
    return {
      perCaseRate: policy?.per_case_rate ?? envNum('PAYROLL_PER_CASE_RATE', 30_000),
      qnaRate: policy?.qna_rate ?? envNum('PAYROLL_QNA_RATE', 5_000),
      gradeAllowance: envNum('PAYROLL_GRADE_ALLOWANCE', 0),
    };
  }
}
