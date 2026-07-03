import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import { withCronLock } from '../../common/cache/cron-lock';
import { AvailabilityService } from '../availability/availability.service';
import { BookingService } from '../booking/booking.service';
import { kstDateString, utcFromKst } from '../../common/time/kst';
import { AccountRole, ConsultMode, ConsultType, TeacherGrade } from '../../config/enums';
import { consultTypeFromPrisma, consultTypeToPrisma } from '../../config/prisma-enums';
import { resolveStudentType } from '../../common/student-type';

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
    const sp = await this.prisma.student_profile.findUnique({ where: { account_id: user.id }, select: { center_id: true, type_code: true } });
    if (!sp) throw new NotFoundException('학생 등록(프로필)이 완료되지 않았습니다.');
    let mode = dto.mode ?? ConsultMode.ZOOM;
    // 외부학생 온라인 한정이면 오프라인 요청을 온라인으로 보정(예약 게이트와 일관)
    if (resolveStudentType(sp) === 'external' && mode === ConsultMode.OFFLINE) {
      const extPol = await this.booking.getExternalPolicy();
      if (extPol.onlineOnly) mode = ConsultMode.ZOOM;
    }
    const ctPrisma = consultTypeToPrisma(dto.consultType);
    const dup = await this.prisma.auto_assign_request.findFirst({
      where: { student_id: user.id, status: 'waiting', consult_type: ctPrisma as never },
    });
    if (dup) return dup;
    return this.prisma.auto_assign_request.create({
      data: {
        student_id: user.id, center_id: sp.center_id, consult_type: ctPrisma as never,
        sub_type: dto.subType ?? null, mode, status: 'waiting',
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

  // ── 관리자 대시보드: 큐 상태 · 배치 결과 · 전임 부하 ──────────────
  private static readonly ORIGINS = ['전임자동', '자동배정', '질문배정', '역상담자동'];

  async dashboard(actor: AuthUser, now = new Date()) {
    const centerId = actor.centerId ?? null; // null = 전사(본사)
    const cWhere = centerId ? { center_id: centerId } : {};

    // 1) 대기열 상태 카운트
    const queueGroups = await this.prisma.auto_assign_request.groupBy({ by: ['status'], where: cWhere, _count: { _all: true } });
    const queue = { waiting: 0, assigned: 0, cancelled: 0 } as Record<string, number>;
    for (const g of queueGroups) queue[g.status] = g._count._all;

    // 2) 대기 목록(오래된 순)
    const waitingRows = await this.prisma.auto_assign_request.findMany({ where: { ...cWhere, status: 'waiting' }, orderBy: { created_at: 'asc' }, take: 50 });
    const names = await this.nameMap(waitingRows.map((r) => r.student_id));
    const waitingList = waitingRows.map((r) => ({
      id: r.id, studentName: names[r.student_id] ?? '학생',
      consultType: consultTypeFromPrisma(r.consult_type), mode: r.mode, createdAt: r.created_at,
    }));

    // 3) 최근 7일 강제배정 건수 by 출처
    const since = new Date(now.getTime() - 7 * 86_400_000);
    const originGroups = await this.prisma.booking.groupBy({
      by: ['origin'], where: { ...cWhere, origin: { in: AssignmentService.ORIGINS }, created_at: { gte: since } }, _count: { _all: true },
    });
    const byOrigin = Object.fromEntries(AssignmentService.ORIGINS.map((o) => [o, 0]));
    for (const g of originGroups) if (g.origin) byOrigin[g.origin] = g._count._all;

    // 4) 전임 현황 + 오늘 배정 건수
    const todayStr = kstDateString(now);
    const dayStart = utcFromKst(todayStr, 0);
    const dayEnd = utcFromKst(todayStr, 1440);
    const fullTimers = await this.prisma.teacher_profile.findMany({
      where: { employment_type: '전임', ...(centerId ? { center_id: centerId } : {}) },
      select: { account_id: true, account: { select: { name: true } }, center: { select: { name: true } } },
    });
    const ftIds = fullTimers.map((t) => t.account_id);
    const todayGroups = ftIds.length
      ? await this.prisma.booking.groupBy({
          by: ['teacher_id'], where: { teacher_id: { in: ftIds }, origin: { in: AssignmentService.ORIGINS }, start_at: { gte: dayStart, lt: dayEnd } }, _count: { _all: true },
        })
      : [];
    const todayByTeacher = new Map(todayGroups.map((g) => [g.teacher_id, g._count._all]));
    const teachers = fullTimers.map((t) => ({
      teacherId: t.account_id, name: t.account?.name ?? '선생님', center: t.center?.name ?? null,
      todayAssigned: todayByTeacher.get(t.account_id) ?? 0,
    })).sort((a, b) => b.todayAssigned - a.todayAssigned);

    // 5) 센터별 요약(본사만)
    let byCenter: Array<{ centerId: string; center: string; waiting: number; assigned7d: number; fullTimers: number }> | undefined;
    if (!centerId) {
      const centers = await this.prisma.center.findMany({ select: { id: true, name: true } });
      const waitByCenter = await this.prisma.auto_assign_request.groupBy({ by: ['center_id'], where: { status: 'waiting' }, _count: { _all: true } });
      const asgByCenter = await this.prisma.booking.groupBy({ by: ['center_id'], where: { origin: { in: AssignmentService.ORIGINS }, created_at: { gte: since } }, _count: { _all: true } });
      const ftByCenter = await this.prisma.teacher_profile.groupBy({ by: ['center_id'], where: { employment_type: '전임' }, _count: { _all: true } });
      const wMap = new Map(waitByCenter.map((g) => [g.center_id, g._count._all]));
      const aMap = new Map(asgByCenter.map((g) => [g.center_id, g._count._all]));
      const fMap = new Map(ftByCenter.map((g) => [g.center_id, g._count._all]));
      byCenter = centers
        .map((c) => ({ centerId: c.id, center: c.name, waiting: wMap.get(c.id) ?? 0, assigned7d: aMap.get(c.id) ?? 0, fullTimers: fMap.get(c.id) ?? 0 }))
        .filter((c) => c.waiting || c.assigned7d || c.fullTimers)
        .sort((a, b) => b.assigned7d - a.assigned7d);
    }

    return { scope: centerId ?? 'global', queue, waitingList, byOrigin, teachers, byCenter };
  }

  private async nameMap(ids: string[]): Promise<Record<string, string>> {
    const uniq = [...new Set(ids)];
    if (!uniq.length) return {};
    const rows = await this.prisma.account.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } });
    return Object.fromEntries(rows.map((r) => [r.id, r.name]));
  }

  // ── 배치: 전임 빈 슬롯에 우선순위대로 배정(①자동매칭 대기 → ②질문) ──
  async runFill(now = new Date()): Promise<{ assigned: number; waiting: number; questionBlocks: number }> {
    const teachers = await this.prisma.teacher_profile.findMany({
      where: { employment_type: '전임' },
      select: { account_id: true, center_id: true, grade: true },
    });
    if (!teachers.length) return { assigned: 0, waiting: 0, questionBlocks: 0 };
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
    // ② 미답변 질문(전임 지정) → 남은 빈 슬롯에 답변블록(무료·이미 과금됨), 난이도별 길이
    let questionBlocks = 0;
    const teacherIds = teachers.map((t) => t.account_id);
    const openQs = await this.prisma.qna_post.findMany({
      where: { status: 'open', scheduled_booking_id: null, assigned_teacher_id: { in: teacherIds } },
      orderBy: { created_at: 'asc' }, take: 200,
    });
    for (const q of openQs) {
      const t = teachers.find((x) => x.account_id === q.assigned_teacher_id);
      if (!t || !q.assigned_teacher_id) continue;
      const need = Math.max(1, Math.round((await this.booking.questionMinutes(q.difficulty)) / SLOT_MIN));
      let placed = false;
      for (let d = 0; d < HORIZON_DAYS && !placed; d++) {
        const dateStr = kstDateString(new Date(now.getTime() + d * 86_400_000));
        const slots = await this.availability.getDaySlots(t.account_id, dateStr, q.student_id);
        const start = firstFreeRun(slots.map((s) => s.status), need);
        if (start === null) continue;
        const res = await this.booking.createAssigned({
          studentId: q.student_id, teacherId: t.account_id, centerId: t.center_id,
          teacherGrade: (t.grade as TeacherGrade) ?? TeacherGrade.B,
          consultType: ConsultType.SUBJECT, mode: ConsultMode.CHAT, dateStr,
          slotStart: slots[start].index, slotEnd: slots[start].index + need,
          charge: 'free', origin: '질문배정', content: `질문 답변: ${(q.body ?? '').slice(0, 80)}`,
        });
        if (res.ok) {
          await this.prisma.qna_post.update({ where: { id: q.id }, data: { scheduled_booking_id: res.bookingId } });
          questionBlocks++; placed = true;
        }
      }
    }
    this.logger.log(`전임 채우기: 자동배정 ${assigned}/${waiting.length}, 질문블록 ${questionBlocks}/${openQs.length}`);
    return { assigned, waiting: waiting.length, questionBlocks };
  }

  /** 매일 새벽 3시 — 최초상담(역상담) 스캔. */
  @Cron('0 3 * * *', { timeZone: 'Asia/Seoul' })
  async scheduledReverseScan() {
    await withCronLock(this.cache, 'assignment-reverse', 900, async () => {
      const r = await this.runReverseScan();
      if (r.created) this.logger.log(`역상담 자동배정: ${r.created}건(스캔 ${r.scanned})`);
    }, this.logger);
  }

  /**
   * 역상담(최초상담) 스캔 — 확정/완료 상담 0건인 재원생을 담임 전임(없으면 센터 전임)의
   * 근무시간 빈 슬롯에 역상담으로 자동 배정(담임 기본시간). 역상담 정책(오프라인/무료) 반영.
   */
  async runReverseScan(now = new Date()): Promise<{ created: number; scanned: number }> {
    const fullTimers = await this.prisma.teacher_profile.findMany({
      where: { employment_type: '전임' },
      select: { account_id: true, center_id: true, grade: true },
    });
    if (!fullTimers.length) return { created: 0, scanned: 0 };
    const ftIds = new Set(fullTimers.map((t) => t.account_id));
    const revPolicy = await this.booking.getReversePolicy();
    const minutes = await this.booking.defaultMinutes(ConsultType.HOMEROOM);
    const need = Math.max(1, Math.round(minutes / SLOT_MIN));
    const mode = revPolicy.offlineOnly ? ConsultMode.OFFLINE : ConsultMode.ZOOM;

    const candidates = await this.prisma.student_profile.findMany({
      where: { center_id: { not: null } },
      select: { account_id: true, center_id: true, homeroom_teacher_id: true, type_code: true },
      take: 500,
    });
    let created = 0, scanned = 0;
    for (const s of candidates) {
      if (created >= 100) break; // 1회 실행 상한
      if (resolveStudentType(s) !== 'enrolled') continue;
      const prior = await this.prisma.booking.count({
        where: { student_id: s.account_id, status: { in: ['confirmed', 'done'] as never } },
      });
      if (prior > 0) continue; // 최초상담 이미 이수(또는 예정 확정)
      scanned++;
      // 담임 전임 우선, 없으면 센터 내 전임
      let t = s.homeroom_teacher_id && ftIds.has(s.homeroom_teacher_id)
        ? fullTimers.find((x) => x.account_id === s.homeroom_teacher_id)
        : undefined;
      if (!t) t = fullTimers.find((x) => x.center_id === s.center_id);
      if (!t) continue;
      for (let d = 0; d < HORIZON_DAYS; d++) {
        const dateStr = kstDateString(new Date(now.getTime() + d * 86_400_000));
        const slots = await this.availability.getDaySlots(t.account_id, dateStr, s.account_id);
        const start = firstFreeRun(slots.map((x) => x.status), need);
        if (start === null) continue;
        const res = await this.booking.createAssigned({
          studentId: s.account_id, teacherId: t.account_id, centerId: t.center_id,
          teacherGrade: (t.grade as TeacherGrade) ?? TeacherGrade.B,
          consultType: ConsultType.HOMEROOM, mode, dateStr,
          slotStart: slots[start].index, slotEnd: slots[start].index + need,
          charge: revPolicy.free ? 'free' : 'session', origin: '역상담자동', direction: 'reverse',
        });
        if (res.ok) { created++; break; }
      }
    }
    this.logger.log(`역상담 스캔: 생성 ${created}/미이수 ${scanned}`);
    return { created, scanned };
  }
}
