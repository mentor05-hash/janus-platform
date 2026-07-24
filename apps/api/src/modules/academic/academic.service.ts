import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { AccountRole, AccountStatus } from '../../config/enums';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import { withCronLock } from '../../common/cache/cron-lock';
import { NotifyService } from '../notification/notify.service';

export type AcademicEventInput = {
  title: string;
  type?: string;
  startDate: string;
  endDate?: string | null;
  grade?: string | null;
  description?: string | null;
  centerId?: string | null; // 본사만 의미(전국=null 또는 특정 센터)
};

const dateOnly = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);

/**
 * 학사일정(월별 중요일정). 본사(HQ=admin+센터미소속) → 전국(center NULL) 또는 지정 센터.
 * 센터 관리자 → 자기 센터 일정만 생성·수정. 조회는 전 로그인 사용자(본인 센터 + 전국).
 */
@Injectable()
export class AcademicService {
  private readonly logger = new Logger(AcademicService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
  ) {}

  private isHq(actor: AuthUser) {
    return actor.role === AccountRole.ADMIN && !actor.centerId;
  }

  async create(actor: AuthUser, dto: AcademicEventInput) {
    const centerId = this.isHq(actor)
      ? (dto.centerId ?? null)
      : (actor.centerId ?? null);
    return this.prisma.academic_event.create({
      data: {
        center_id: centerId,
        title: dto.title.trim(),
        type: dto.type ?? 'etc',
        start_date: dateOnly(dto.startDate),
        end_date: dto.endDate ? dateOnly(dto.endDate) : null,
        grade: dto.grade ?? null,
        description: dto.description ?? null,
        created_by: actor.id,
      },
    });
  }

  /** 관리자 목록. 본사=전체(+centerId 필터), 센터관리자=본인 센터+전국. */
  async listAdmin(
    actor: AuthUser,
    from?: string,
    to?: string,
    centerId?: string,
  ) {
    const where: Record<string, unknown> = {};
    if (from || to)
      where.start_date = {
        ...(from ? { gte: dateOnly(from) } : {}),
        ...(to ? { lte: dateOnly(to) } : {}),
      };
    if (this.isHq(actor)) {
      if (centerId) where.center_id = centerId;
    } else {
      where.OR = [{ center_id: null }, { center_id: actor.centerId ?? '' }];
    }
    return this.prisma.academic_event.findMany({
      where,
      orderBy: { start_date: 'asc' },
    });
  }

  async update(actor: AuthUser, id: string, dto: Partial<AcademicEventInput>) {
    const ev = await this.prisma.academic_event.findUnique({ where: { id } });
    if (!ev) throw new NotFoundException('학사일정을 찾을 수 없습니다.');
    if (!this.isHq(actor) && ev.center_id !== actor.centerId)
      throw new ForbiddenException(
        '다른 센터(또는 전국) 일정은 수정할 수 없습니다.',
      );
    return this.prisma.academic_event.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.startDate !== undefined
          ? { start_date: dateOnly(dto.startDate) }
          : {}),
        ...(dto.endDate !== undefined
          ? { end_date: dto.endDate ? dateOnly(dto.endDate) : null }
          : {}),
        ...(dto.grade !== undefined ? { grade: dto.grade } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        updated_at: new Date(),
      },
    });
  }

  async remove(actor: AuthUser, id: string) {
    const ev = await this.prisma.academic_event.findUnique({ where: { id } });
    if (!ev) throw new NotFoundException('학사일정을 찾을 수 없습니다.');
    if (!this.isHq(actor) && ev.center_id !== actor.centerId)
      throw new ForbiddenException(
        '다른 센터(또는 전국) 일정은 삭제할 수 없습니다.',
      );
    await this.prisma.academic_event.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * 로그인 사용자 조회 — 전국(center NULL) + 관련 센터. 기본: 이번 달 전후.
   * 학생·선생님·관리자: 본인 센터. 학부모: 본인 센터가 없으므로 연결 자녀(승인)의 센터.
   */
  async listForViewer(user: AuthUser, from?: string, to?: string) {
    const centerIds = new Set<string>();
    if (user.centerId) centerIds.add(user.centerId);
    if (user.role === AccountRole.GUARDIAN) {
      const links = await this.prisma.guardian_student_link.findMany({
        where: { guardian_id: user.id, status: 'approved' },
        select: { student_id: true },
      });
      if (links.length) {
        const kids = await this.prisma.student_profile.findMany({
          where: { account_id: { in: links.map((l) => l.student_id) } },
          select: { center_id: true },
        });
        kids.forEach((k) => k.center_id && centerIds.add(k.center_id));
      }
    }
    const where: Record<string, unknown> = {
      OR: [
        { center_id: null },
        ...[...centerIds].map((id) => ({ center_id: id })),
      ],
    };
    if (from || to)
      where.start_date = {
        ...(from ? { gte: dateOnly(from) } : {}),
        ...(to ? { lte: dateOnly(to) } : {}),
      };
    return this.prisma.academic_event.findMany({
      where,
      orderBy: { start_date: 'asc' },
    });
  }

  // ── 임박 자동 알림 (D-7 / D-1 / 당일) ──
  private static readonly OFFSETS: {
    days: number;
    key: string;
    label: string;
  }[] = [
    { days: 7, key: 'd7', label: 'D-7' },
    { days: 1, key: 'd1', label: 'D-1' },
    { days: 0, key: 'd0', label: 'D-DAY' },
  ];

  /** 매일 08:00 KST: D-7/D-1/당일 도래 일정 → 대상 학생·학부모 알림(오프셋별 1회). */
  @Cron('0 8 * * *', { timeZone: 'Asia/Seoul' })
  async reminderTick() {
    await withCronLock(
      this.cache,
      'academic-reminder',
      300,
      async () => {
        const n = await this.runReminders();
        if (n) this.logger.log(`학사일정 임박 알림: ${n}건 이벤트 발송`);
      },
      this.logger,
    );
  }

  /** now(KST) 기준 D-7/D-1/당일 이벤트에 리마인더 발송. 이미 보낸 오프셋은 skip. 반환=발송 이벤트 수. */
  async runReminders(now = new Date()): Promise<number> {
    const todayKst = now.toLocaleDateString('en-CA', {
      timeZone: 'Asia/Seoul',
    });
    const base = new Date(`${todayKst}T00:00:00.000Z`).getTime();
    let events = 0;
    for (const off of AcademicService.OFFSETS) {
      const target = new Date(base + off.days * 86400000);
      const rows = await this.prisma.academic_event.findMany({
        where: { start_date: target, NOT: { reminded: { has: off.key } } },
      });
      for (const ev of rows) {
        // 선점: has 필터 + push 로 오프셋 1회 보장(분산 락과 병행).
        const claim = await this.prisma.academic_event.updateMany({
          where: { id: ev.id, NOT: { reminded: { has: off.key } } },
          data: { reminded: { push: off.key } },
        });
        if (claim.count !== 1) continue;
        await this.dispatchReminder(ev, off.label);
        events++;
      }
    }
    return events;
  }

  /** 이벤트 대상(학년·센터 스코프) 학생 + 그 자녀의 학부모에게 알림. */
  private async dispatchReminder(
    ev: {
      id: string;
      title: string;
      type: string;
      start_date: Date;
      end_date: Date | null;
      grade: string | null;
      center_id: string | null;
    },
    ddayLabel: string,
  ) {
    const dateLabel =
      ev.end_date && ev.end_date.getTime() !== ev.start_date.getTime()
        ? `${ev.start_date.toISOString().slice(0, 10)} ~ ${ev.end_date.toISOString().slice(0, 10)}`
        : ev.start_date.toISOString().slice(0, 10);
    const gradeFilter = ev.grade && ev.grade !== '전체' ? ev.grade : null;

    // 대상 학생(승인) — 센터·학년 스코프.
    const profiles = await this.prisma.student_profile.findMany({
      where: {
        ...(ev.center_id ? { center_id: ev.center_id } : {}),
        ...(gradeFilter ? { school_grade: gradeFilter } : {}),
        account: { status: AccountStatus.APPROVED },
      },
      select: { account_id: true },
    });
    const studentIds = profiles.map((p) => p.account_id);

    // 대상 학부모 — 위 학생과 승인 연결된 보호자.
    const links = studentIds.length
      ? await this.prisma.guardian_student_link.findMany({
          where: { student_id: { in: studentIds }, status: 'approved' },
          select: { guardian_id: true },
        })
      : [];
    const guardianIds = [...new Set(links.map((l) => l.guardian_id))];

    const payload = {
      title: ev.title,
      ddayLabel,
      dateLabel,
      type: ev.type,
      eventId: ev.id,
    };
    for (const id of [...studentIds, ...guardianIds]) {
      await this.notify.notify(id, 'academic_reminder', payload);
    }
  }
}
