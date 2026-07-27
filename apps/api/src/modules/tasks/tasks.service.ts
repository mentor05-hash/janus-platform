import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import { withCronLock } from '../../common/cache/cron-lock';
import { NotifyService } from '../notification/notify.service';

export type TaskInput = {
  title: string;
  category?: string;
  subject?: string | null;
  dueDate?: string | null;
};

const dateOnly = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 맞춤 할 일(체크리스트) — 진단(격차)·학사일정 → 실행. 자동 제안(멱등) + 수동.
 * 조회 시 제안을 생성(source_key 로 중복/삭제복원 방지: dismissed 톰스톤 유지).
 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
  ) {}

  /** 학생 할 일 목록(자동 제안 생성 후 반환). dismissed 제외. */
  async list(user: AuthUser) {
    await this.generateSuggestions(user.id);
    return this.prisma.student_task.findMany({
      where: { student_id: user.id, status: { in: ['todo', 'done'] } },
      orderBy: [{ status: 'asc' }, { due_date: 'asc' }, { created_at: 'desc' }],
    });
  }

  /** 격차(약점 과목) + 학사일정(30일 내) → 제안 upsert(멱등). */
  private async generateSuggestions(studentId: string) {
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: studentId },
      select: { goal_avg: true, center_id: true },
    });
    const suggestions: {
      source_key: string;
      title: string;
      category: string;
      subject?: string | null;
      due_date?: Date | null;
      cta_href: string;
    }[] = [];

    // 약점 과목: 최신 성적 회차에서 목표 평균 미달 과목
    const goalAvg = sp?.goal_avg ?? null;
    if (goalAvg != null) {
      const report = await this.prisma.score_report.findFirst({
        where: { student_id: studentId },
        orderBy: { created_at: 'desc' },
        include: { items: true },
      });
      for (const it of report?.items ?? []) {
        const score = it.score != null ? Number(it.score) : null;
        if (score != null && goalAvg - score > 0) {
          const gap = r1(goalAvg - score);
          suggestions.push({
            source_key: `gap:${it.subject}`,
            title: `${it.subject} 약점 보완 (목표까지 ${gap}점)`,
            category: 'gap',
            subject: it.subject,
            cta_href: `/student/search?subject=${encodeURIComponent(it.subject)}`,
          });
        }
      }
    }

    // 다가오는 학사일정(오늘~30일, 전국 + 본인 센터)
    const now = new Date();
    const today = new Date(
      `${now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })}T00:00:00.000Z`,
    );
    const in30 = new Date(today.getTime() + 30 * 86400000);
    const events = await this.prisma.academic_event.findMany({
      where: {
        start_date: { gte: today, lte: in30 },
        OR: [
          { center_id: null },
          ...(sp?.center_id ? [{ center_id: sp.center_id }] : []),
        ],
      },
      orderBy: { start_date: 'asc' },
      take: 10,
    });
    for (const e of events) {
      suggestions.push({
        source_key: `aca:${e.id}`,
        title: `${e.title} 대비`,
        category: 'academic',
        due_date: e.start_date,
        cta_href: '/student/academic',
      });
    }

    // 낡은 격차 제안 재조정 — 목표(goal_avg)나 성적이 바뀌면 기존 gap 항목의 제목("목표까지 N점")이 낡는다.
    // source_key 가 유니크라 createMany 로는 갱신되지 않으므로(ON CONFLICT DO NOTHING) 여기서 직접 맞춘다.
    // 미완료(todo) 자동 항목만 대상: 격차가 사라졌으면 삭제, 수치가 변했으면 제목 갱신.
    // dismissed(숨김 의사)·done(이력)은 보존 — 사용자 의사를 되살리지 않는다.
    const desiredGap = new Map(
      suggestions
        .filter((s) => s.category === 'gap')
        .map((s) => [s.source_key, s.title]),
    );
    const staleGap = await this.prisma.student_task.findMany({
      where: {
        student_id: studentId,
        created_by: 'auto',
        category: 'gap',
        status: 'todo',
      },
      select: { id: true, source_key: true, title: true },
    });
    for (const t of staleGap) {
      const want = t.source_key ? desiredGap.get(t.source_key) : undefined;
      if (want === undefined)
        await this.prisma.student_task.delete({ where: { id: t.id } });
      else if (want !== t.title)
        await this.prisma.student_task.update({
          where: { id: t.id },
          data: { title: want },
        });
    }

    if (!suggestions.length) return;
    // 멱등: 이미 있는 source_key(todo/done/dismissed 모두) 는 ON CONFLICT DO NOTHING 으로 skip
    await this.prisma.student_task.createMany({
      data: suggestions.map((s) => ({
        ...s,
        student_id: studentId,
        created_by: 'auto',
      })),
      skipDuplicates: true,
    });
  }

  /** 수동 할 일 추가. */
  create(user: AuthUser, dto: TaskInput) {
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('할 일 제목을 입력하세요.');
    return this.prisma.student_task.create({
      data: {
        student_id: user.id,
        title,
        category: dto.category ?? 'custom',
        subject: dto.subject ?? null,
        due_date: dto.dueDate ? dateOnly(dto.dueDate) : null,
        created_by: 'self',
      },
    });
  }

  private async owned(user: AuthUser, id: string) {
    const t = await this.prisma.student_task.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('할 일을 찾을 수 없습니다.');
    if (t.student_id !== user.id)
      throw new ForbiddenException('본인 할 일만 변경할 수 있습니다.');
    return t;
  }

  /** 상태 변경(todo/done/dismissed). done 시 done_at 기록. */
  async setStatus(
    user: AuthUser,
    id: string,
    status: 'todo' | 'done' | 'dismissed',
  ) {
    await this.owned(user, id);
    return this.prisma.student_task.update({
      where: { id },
      data: { status, done_at: status === 'done' ? new Date() : null },
    });
  }

  /** 삭제(수동 항목만 — 자동 항목은 dismiss 로 숨김). */
  async remove(user: AuthUser, id: string) {
    const t = await this.owned(user, id);
    if (t.created_by !== 'self') {
      // 자동 제안은 삭제 대신 숨김(재생성 방지)
      await this.prisma.student_task.update({
        where: { id },
        data: { status: 'dismissed' },
      });
      return { id, dismissed: true };
    }
    await this.prisma.student_task.delete({ where: { id } });
    return { id, deleted: true };
  }

  // ── 마감 리마인더(D-1 / 당일) ──
  private static readonly OFFSETS: {
    days: number;
    key: string;
    label: string;
  }[] = [
    { days: 1, key: 'd1', label: '내일' },
    { days: 0, key: 'd0', label: '오늘' },
  ];

  /** 매일 08:00 KST: 마감(due_date) 임박한 미완료 할 일 → 학생 알림(오프셋별 1회). */
  @Cron('0 8 * * *', { timeZone: 'Asia/Seoul' })
  async reminderTick() {
    await withCronLock(
      this.cache,
      'task-reminder',
      300,
      async () => {
        const n = await this.runReminders();
        if (n) this.logger.log(`할 일 마감 리마인더: ${n}건`);
      },
      this.logger,
    );
  }

  async runReminders(now = new Date()): Promise<number> {
    const todayKst = now.toLocaleDateString('en-CA', {
      timeZone: 'Asia/Seoul',
    });
    const base = new Date(`${todayKst}T00:00:00.000Z`).getTime();
    let sent = 0;
    for (const off of TasksService.OFFSETS) {
      const target = new Date(base + off.days * 86400000);
      const rows = await this.prisma.student_task.findMany({
        where: {
          status: 'todo',
          due_date: target,
          NOT: { reminded: { has: off.key } },
        },
        select: { id: true, student_id: true, title: true },
      });
      for (const t of rows) {
        const claim = await this.prisma.student_task.updateMany({
          where: { id: t.id, NOT: { reminded: { has: off.key } } },
          data: { reminded: { push: off.key } },
        });
        if (claim.count !== 1) continue;
        await this.notify.notify(t.student_id, 'task_reminder', {
          taskId: t.id,
          title: t.title,
          when: off.label,
        });
        sent++;
      }
    }
    return sent;
  }
}
