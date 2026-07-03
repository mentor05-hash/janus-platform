import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import { withCronLock } from '../../common/cache/cron-lock';
import { AvailabilityService } from '../availability/availability.service';
import { BookingService } from '../booking/booking.service';
import { kstDateString } from '../../common/time/kst';
import { AccountRole, ConsultMode, ConsultType, TeacherGrade } from '../../config/enums';
import { consultTypeFromPrisma, consultTypeToPrisma } from '../../config/prisma-enums';

const HORIZON_DAYS = 7;
const SLOT_MIN = 10;

/** slots 상태 배열에서 need 개 연속 'avail' 시작 위치(배열 인덱스). 없으면 null. */
function firstFreeRun(statuses: string[], need: number): number | null {
  let run = 0;
  for (let i = 0; i < statuses.length; i++) {
    if (statuses[i] === 'avail') {
      run++;
      if (run >= need) return i - need + 1;
    } else run = 0;
  }
  return null;
}

/**
 * 전임 강제 배정 엔진(§선생님 근무시간 강제 배정).
 * - 자동배정 대기열: 학생이 시간 미지정 신청 → 배치가 전임 근무시간 빈 슬롯에 배정.
 * - (B2 질문 답변블록·B3 역상담 스캔은 후속 추가)
 */
@Injectable()
export class AssignmentService {
  private readonly logger = new Logger('Assignment');
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly booking: BookingService,
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
  ) {}

  /** 15분마다 전임 빈 슬롯 자동배정 채우기(다중 인스턴스 안전을 위해 cron-lock). */
  @Cron('*/15 * * * *', { timeZone: 'Asia/Seoul' })
  async scheduledFill() {
    await withCronLock(this.cache, 'assignment-fill', 300, async () => {
      const r = await this.runFill();
      if (r.assigned) this.logger.log(`스케줄 자동배정: ${r.assigned}건`);
    }, this.logger);
  }

  // ── 학생: 자동배정 신청/조회/취소 ─────────────────────────────
  async requestAutoAssign(user: AuthUser, dto: { consultType: ConsultType; mode?: ConsultMode; subType?: string }) {
    if (user.role !== AccountRole.STUDENT) throw new ForbiddenException('학생만 자동배정을 신청할 수 있습니다.');
    const sp = await this.prisma.student_profile.findUnique({ where: { account_id: user.id }, select: { center_id: true } });
    if (!sp) throw new NotFoundException('학생 등록(프로필)이 완료되지 않았습니다.');
    const ctPrisma = consultTypeToPrisma(dto.consultType);
    const dup = await this.prisma.auto_assign_request.findFirst({
      where: { student_id: user.id, status: 'waiting', consult_type: ctPrisma as never },
    });
    if (dup) return dup;
    return this.prisma.auto_assign_request.create({
      data: {
        student_id: user.id, center_id: sp.center_id, consult_type: ctPrisma as never,
        sub_type: dto.subType ?? null, mode: dto.mode ?? ConsultMode.ZOOM, status: 'waiting',
      },
    });
  }

  myRequests(user: AuthUser) {
    return this.prisma.auto_assign_request.findMany({ where: { student_id: user.id }, orderBy: { created_at: 'desc' }, take: 50 });
  }

  async cancelRequest(user: AuthUser, id: string) {
    const r = await this.prisma.auto_assign_request.findUnique({ where: { id } });
    if (!r || r.student_id !== user.id) throw new NotFoundException('신청을 찾을 수 없습니다.');
    if (r.status === 'waiting') await this.prisma.auto_assign_request.update({ where: { id }, data: { status: 'cancelled' } });
    return { ok: true };
  }

  // ── 배치: 전임 빈 슬롯에 자동배정 대기 학생 배정 ────────────────
  async runFill(now = new Date()): Promise<{ assigned: number; waiting: number }> {
    const teachers = await this.prisma.teacher_profile.findMany({
      where: { employment_type: '전임' },
      select: { account_id: true, center_id: true, grade: true },
    });
    if (!teachers.length) return { assigned: 0, waiting: 0 };
    const waiting = await this.prisma.auto_assign_request.findMany({
      where: { status: 'waiting' }, orderBy: { created_at: 'asc' }, take: 200,
    });
    let assigned = 0;
    for (const req of waiting) {
      const consultKo = consultTypeFromPrisma(req.consult_type) as ConsultType;
      const minutes = await this.booking.defaultMinutes(consultKo);
      const need = Math.max(1, Math.round(minutes / SLOT_MIN));
      const mode = (req.mode as ConsultMode) ?? ConsultMode.ZOOM;
      const pool = teachers.filter((t) => !req.center_id || t.center_id === req.center_id);
      let placed = false;
      for (let d = 0; d < HORIZON_DAYS && !placed; d++) {
        const dateStr = kstDateString(new Date(now.getTime() + d * 86_400_000));
        for (const t of pool) {
          const slots = await this.availability.getDaySlots(t.account_id, dateStr, req.student_id);
          const start = firstFreeRun(slots.map((s) => s.status), need);
          if (start === null) continue;
          const res = await this.booking.createAssigned({
            studentId: req.student_id, teacherId: t.account_id, centerId: t.center_id,
            teacherGrade: (t.grade as TeacherGrade) ?? TeacherGrade.B,
            consultType: consultKo, subType: req.sub_type, mode, dateStr,
            slotStart: slots[start].index, slotEnd: slots[start].index + need,
            charge: 'session', origin: '자동배정',
          });
          if (res.ok) {
            await this.prisma.auto_assign_request.update({
              where: { id: req.id }, data: { status: 'assigned', assigned_booking_id: res.bookingId, assigned_at: now },
            });
            assigned++; placed = true; break;
          }
        }
      }
    }
    this.logger.log(`자동배정 채우기: ${assigned}/${waiting.length}건 배정`);
    return { assigned, waiting: waiting.length };
  }
}
