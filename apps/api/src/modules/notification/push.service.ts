import { Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotifyService } from './notify.service';

/** 푸시 토큰(expo-notifications) 등록·해제 + mock 테스트 발송. */
@Injectable()
export class PushService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
  ) {}

  async register(user: AuthUser, token: string, platform?: string) {
    await this.prisma.push_token.upsert({
      where: { token },
      create: { account_id: user.id, token, platform: platform ?? null },
      update: { account_id: user.id, platform: platform ?? null, last_seen_at: new Date() },
    });
    return { ok: true };
  }

  async unregister(user: AuthUser, token: string) {
    await this.prisma.push_token.deleteMany({ where: { account_id: user.id, token } });
    return { ok: true };
  }

  async list(user: AuthUser) {
    const rows = await this.prisma.push_token.findMany({
      where: { account_id: user.id },
      select: { token: true, platform: true, created_at: true },
      orderBy: { created_at: 'desc' },
    });
    return { count: rows.length, tokens: rows };
  }

  /** mock 테스트 푸시(본인에게) — 게이트웨이가 등록 기기로 발송하는 척. */
  async test(user: AuthUser) {
    await this.notify.notify(user.id, 'push_test', { title: '테스트 푸시', body: '푸시 알림이 정상 등록되었습니다.' }, ['app', 'push']);
    return { ok: true, message: '테스트 푸시를 발송했습니다(알림함·mock 푸시).' };
  }
}
