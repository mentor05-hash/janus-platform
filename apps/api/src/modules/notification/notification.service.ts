import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * 알림 조회/읽음 (CLAUDE.md §3 notification). 발송은 NotificationProvider 어댑터가,
 * 수신함 조회는 여기서. 본인(recipient) 알림만.
 */
@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  list(recipientId: string) {
    return this.prisma.notification.findMany({
      where: { recipient_id: recipientId },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
  }

  async markRead(id: string, recipientId: string) {
    // 본인 알림만 읽음 처리(IDOR 방지) — 조건부 updateMany
    const upd = await this.prisma.notification.updateMany({
      where: { id, recipient_id: recipientId, read_at: null },
      data: { read_at: new Date() },
    });
    if (upd.count === 0) {
      const exists = await this.prisma.notification.findFirst({ where: { id, recipient_id: recipientId } });
      if (!exists) throw new ForbiddenException('본인 알림이 아닙니다.');
    }
    return { id, read: true };
  }
}
