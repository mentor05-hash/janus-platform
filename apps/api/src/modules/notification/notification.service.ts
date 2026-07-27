import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  renderNotification,
  type NotifPayload,
} from './notification-templates';

/**
 * 알림 조회/읽음 (CLAUDE.md §3 notification). 발송은 NotificationProvider 어댑터가,
 * 수신함 조회는 여기서. 본인(recipient) 알림만. 표시 문구는 템플릿으로 렌더링(읽기 시점).
 */
@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(recipientId: string) {
    const rows = await this.prisma.notification.findMany({
      where: { recipient_id: recipientId },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    // type+payload → 표시용 {title, body} 를 서버에서 일관 렌더링.
    return rows.map((n) => {
      const { title, body } = renderNotification(
        n.type ?? '',
        (n.payload as NotifPayload) ?? {},
      );
      return { ...n, title, body };
    });
  }

  async markRead(id: string, recipientId: string) {
    // 본인 알림만 읽음 처리(IDOR 방지) — 조건부 updateMany
    const upd = await this.prisma.notification.updateMany({
      where: { id, recipient_id: recipientId, read_at: null },
      data: { read_at: new Date() },
    });
    if (upd.count === 0) {
      const exists = await this.prisma.notification.findFirst({
        where: { id, recipient_id: recipientId },
      });
      if (!exists) throw new ForbiddenException('본인 알림이 아닙니다.');
    }
    return { id, read: true };
  }

  /** 내 알림 전체 읽음 처리. */
  async markAllRead(recipientId: string) {
    const upd = await this.prisma.notification.updateMany({
      where: { recipient_id: recipientId, read_at: null },
      data: { read_at: new Date() },
    });
    return { read: upd.count };
  }
}
