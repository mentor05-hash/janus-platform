import { Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountRole, AccountStatus } from '../../config/enums';
import { NotifyService } from './notify.service';
import { AnnouncementDto } from './dto/announcement.dto';

/**
 * 공지 알림 발송 (§3 notification). 센터관리자/본사관리자가 대상 역할별로 공지.
 * 센터관리자(admin + center 소속) → 자기 센터로 강제 스코프.
 * 본사(HQ, admin + center 미소속) → 전체 또는 dto.centerId 한정.
 */
@Injectable()
export class AnnouncementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
  ) {}

  async send(actor: AuthUser, dto: AnnouncementDto) {
    const isHq = actor.role === AccountRole.ADMIN && !actor.centerId;
    // 센터관리자는 자기 센터 강제. HQ 는 dto.centerId(없으면 전체).
    const scopeCenter = isHq ? dto.centerId : actor.centerId;
    const channels = dto.channels ?? ['app'];

    const byTarget: Record<string, number> = {};
    let sent = 0;
    for (const role of [...new Set(dto.targets)]) {
      const accounts = await this.prisma.account.findMany({
        where: {
          role: role as AccountRole,
          status: AccountStatus.APPROVED,
          ...(scopeCenter ? { center_id: scopeCenter } : {}),
        },
        select: { id: true },
      });
      for (const a of accounts) {
        await this.notify.notify(a.id, 'announcement', { title: dto.title, body: dto.body, from: actor.id }, channels);
      }
      byTarget[role] = accounts.length;
      sent += accounts.length;
    }
    return { sent, byTarget, scope: scopeCenter ?? 'all' };
  }
}
