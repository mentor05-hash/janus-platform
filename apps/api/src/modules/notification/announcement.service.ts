import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import { withCronLock } from '../../common/cache/cron-lock';
import { AccountRole, AccountStatus } from '../../config/enums';
import { NotifyService } from './notify.service';
import {
  AnnouncementDto,
  AnnouncementTemplateDto,
} from './dto/announcement.dto';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type Channel = 'app' | 'sms' | 'kakao';

/**
 * 공지 알림 (§3 notification). 즉시 발송 + 예약 발송(미래 시각 지정 → 스케줄러가 발송).
 * 센터관리자(admin + center) → 자기 센터 강제. 본사(HQ) → 전체 또는 dto.centerId.
 */
@Injectable()
export class AnnouncementService {
  private readonly logger = new Logger(AnnouncementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
  ) {}

  /** scheduledAt 있으면 예약 등록, 없으면 즉시 발송. templateId 지정 시 내용 채움. */
  async send(actor: AuthUser, dto: AnnouncementDto) {
    const scope = this.resolveScope(actor, dto);
    // 템플릿 병합(dto 값이 우선, 없으면 템플릿에서)
    let tmpl: {
      targets: string[];
      title: string;
      body: string;
      channels: string[];
    } | null = null;
    if (dto.templateId) {
      const t = await this.prisma.announcement_template.findUnique({
        where: { id: dto.templateId },
      });
      if (!t) throw new NotFoundException('공지 템플릿을 찾을 수 없습니다.');
      tmpl = {
        targets: t.targets,
        title: t.title,
        body: t.body,
        channels: t.channels,
      };
    }
    const targets = dto.targets ?? tmpl?.targets;
    const title = dto.title ?? tmpl?.title;
    const body = dto.body ?? tmpl?.body;
    if (!targets?.length || !title || !body) {
      throw new BadRequestException(
        'targets/title/body 가 필요합니다(템플릿 또는 직접 입력).',
      );
    }
    const channels = dto.channels ?? (tmpl?.channels as Channel[]) ?? ['app'];
    if (dto.scheduledAt) {
      const when = new Date(dto.scheduledAt);
      if (when.getTime() <= Date.now())
        throw new BadRequestException('예약 시각은 현재보다 미래여야 합니다.');
      const row = await this.prisma.scheduled_announcement.create({
        data: {
          created_by: actor.id,
          targets,
          title,
          body,
          center_id: scope ?? null,
          channels,
          scheduled_at: when,
          status: 'pending',
        },
        select: { id: true, scheduled_at: true, status: true },
      });
      return {
        scheduledId: row.id,
        scheduledAt: row.scheduled_at,
        status: row.status,
        scope: scope ?? 'all',
      };
    }
    const r = await this.dispatch(
      targets,
      title,
      body,
      scope ?? null,
      channels,
      actor.id,
    );
    return { ...r, scope: scope ?? 'all' };
  }

  // ── 공지 템플릿(저장/재사용) ──
  createTemplate(actor: AuthUser, dto: AnnouncementTemplateDto) {
    const isHq = actor.role === AccountRole.ADMIN && !actor.centerId;
    return this.prisma.announcement_template.create({
      data: {
        created_by: actor.id,
        center_id: isHq ? null : actor.centerId,
        name: dto.name,
        targets: dto.targets,
        title: dto.title,
        body: dto.body,
        channels: dto.channels ?? ['app'],
      },
    });
  }

  listTemplates(actor: AuthUser) {
    const isHq = actor.role === AccountRole.ADMIN && !actor.centerId;
    // 본사 공용(center_id NULL) + 본인 센터 템플릿
    return this.prisma.announcement_template.findMany({
      where: isHq
        ? {}
        : { OR: [{ center_id: null }, { center_id: actor.centerId }] },
      orderBy: { created_at: 'desc' },
    });
  }

  async deleteTemplate(id: string, actor: AuthUser) {
    const t = await this.prisma.announcement_template.findUnique({
      where: { id },
    });
    if (!t) throw new NotFoundException('템플릿을 찾을 수 없습니다.');
    const isHq = actor.role === AccountRole.ADMIN && !actor.centerId;
    if (!isHq && t.center_id !== actor.centerId)
      throw new ForbiddenException('다른 센터의 템플릿은 삭제할 수 없습니다.');
    await this.prisma.announcement_template.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** 예약 공지 목록(본인 스코프). */
  async listScheduled(actor: AuthUser) {
    const isHq = actor.role === AccountRole.ADMIN && !actor.centerId;
    return this.prisma.scheduled_announcement.findMany({
      where: {
        status: 'pending',
        ...(isHq ? {} : { center_id: actor.centerId }),
      },
      orderBy: { scheduled_at: 'asc' },
    });
  }

  /** 예약 공지 취소(발송 전). */
  async cancelScheduled(id: string, actor: AuthUser) {
    const row = await this.prisma.scheduled_announcement.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('예약 공지를 찾을 수 없습니다.');
    const isHq = actor.role === AccountRole.ADMIN && !actor.centerId;
    if (!isHq && row.center_id !== actor.centerId)
      throw new ForbiddenException(
        '다른 센터의 예약 공지는 취소할 수 없습니다.',
      );
    const upd = await this.prisma.scheduled_announcement.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'cancelled' },
    });
    if (upd.count !== 1)
      throw new BadRequestException('이미 발송되었거나 취소된 공지입니다.');
    return { id, status: 'cancelled' };
  }

  /** 매분: 발송 전날 사전알림 + 도래분 발송. 선점(updateMany)으로 중복 방지. */
  @Cron('* * * * *')
  async scheduledTick() {
    await withCronLock(this.cache, 'announcement-tick', 55, async () => {
      const rem = await this.runReminders();
      if (rem.reminded) this.logger.log(`예약 공지 사전알림: ${rem.reminded}건`);
      const r = await this.runDue();
      if (r.processed) this.logger.log(`예약 공지 발송: ${r.processed}건`);
    }, this.logger);
  }

  /**
   * 발송 전날(24h 내) 도래 예정인 예약 공지에 대해, 예약한 직원(created_by)에게
   * "곧 발송될 예정"임을 사전 알림. 공지당 1회(reminder_sent).
   */
  async runReminders(now = new Date()): Promise<{ reminded: number }> {
    const soon = new Date(now.getTime() + ONE_DAY_MS);
    const rows = await this.prisma.scheduled_announcement.findMany({
      where: {
        status: 'pending',
        reminder_sent: false,
        scheduled_at: { gt: now, lte: soon },
      },
      take: 100,
    });
    let reminded = 0;
    for (const s of rows) {
      const claim = await this.prisma.scheduled_announcement.updateMany({
        where: { id: s.id, reminder_sent: false },
        data: { reminder_sent: true },
      });
      if (claim.count !== 1) continue;
      await this.notify.notify(s.created_by, 'announcement_reminder', {
        scheduledId: s.id,
        title: s.title,
        scheduledAt: s.scheduled_at.toISOString(),
        targets: s.targets,
      });
      reminded++;
    }
    return { reminded };
  }

  async runDue(now = new Date()): Promise<{ processed: number }> {
    const due = await this.prisma.scheduled_announcement.findMany({
      where: { status: 'pending', scheduled_at: { lte: now } },
      take: 100,
    });
    let processed = 0;
    for (const s of due) {
      const claim = await this.prisma.scheduled_announcement.updateMany({
        where: { id: s.id, status: 'pending' },
        data: { status: 'sent', sent_at: now },
      });
      if (claim.count !== 1) continue; // 다른 실행이 선점
      const r = await this.dispatch(
        s.targets,
        s.title,
        s.body,
        s.center_id,
        s.channels as Channel[],
        s.created_by,
      );
      await this.prisma.scheduled_announcement.update({
        where: { id: s.id },
        data: { sent_count: r.sent },
      });
      processed++;
    }
    return { processed };
  }

  // ── 내부 ──
  private resolveScope(
    actor: AuthUser,
    dto: AnnouncementDto,
  ): string | null | undefined {
    const isHq = actor.role === AccountRole.ADMIN && !actor.centerId;
    return isHq ? dto.centerId : actor.centerId;
  }

  /** 대상 역할별 승인 계정에 알림 발송. */
  private async dispatch(
    targets: string[],
    title: string,
    body: string,
    scope: string | null,
    channels: Channel[],
    from: string,
  ) {
    const byTarget: Record<string, number> = {};
    let sent = 0;
    for (const role of [...new Set(targets)]) {
      const accounts = await this.prisma.account.findMany({
        where: {
          role: role as AccountRole,
          status: AccountStatus.APPROVED,
          ...(scope ? { center_id: scope } : {}),
        },
        select: { id: true },
      });
      for (const a of accounts) {
        await this.notify.notify(
          a.id,
          'announcement',
          { title, body, from },
          channels,
        );
      }
      byTarget[role] = accounts.length;
      sent += accounts.length;
    }
    return { sent, byTarget };
  }
}
