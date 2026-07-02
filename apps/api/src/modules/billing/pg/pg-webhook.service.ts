import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CreditService } from '../credit.service';
import { PgWebhookEvent, PgWebhookType } from './pg.types';

/**
 * PG 웹훅 수신·멱등 처리 (CLAUDE.md §9 O2·§10).
 *
 * 벤더 미연동 상태에서도 구조를 갖춰, 실 PG 연결 시 provider 어댑터만 붙이면 되도록 한다:
 *  1) 서명검증(PG_WEBHOOK_SECRET HMAC-SHA256) — 위·변조 차단(시크릿 미설정 시 데모로 통과).
 *  2) (provider,event_id) 멱등 원장(payment_event)에 1회만 INSERT — PG 재전송 중복 방지.
 *  3) type 별 원장 반영 — paid→충전, refunded→환불(각각 payment.idempotency_key 로 이중 반영 방지).
 *
 * 실 PG 는 이벤트 형태가 제각각이므로, HTTP 컨트롤러가 body 를 PgWebhookEvent 로 정규화해 넘긴다.
 */
@Injectable()
export class PgWebhookService {
  private readonly log = new Logger(PgWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credit: CreditService,
    private readonly config: ConfigService,
  ) {}

  /** 서명검증 — PG_WEBHOOK_SECRET 미설정이면 데모(로컬)로 통과. 실서비스는 반드시 설정. */
  verifySignature(rawBody: string, signature?: string): boolean {
    const secret = this.config.get<string>('PG_WEBHOOK_SECRET');
    if (!secret) return true; // 데모: 시크릿 없으면 검증 생략
    if (!signature) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * 정규화된 웹훅 이벤트 처리(멱등). 반환: 실제 반영 여부·중복 여부.
   */
  async handle(provider: string, event: PgWebhookEvent): Promise<{ duplicate: boolean; applied: boolean }> {
    // 1) 멱등 원장에 선점 INSERT — 이미 있으면 중복(재전송)으로 판정하고 종료.
    try {
      await this.prisma.payment_event.create({
        data: {
          provider,
          event_id: event.eventId,
          type: event.type,
          payload: event as unknown as object,
          status: 'received',
        },
      });
    } catch (e) {
      if (this.isUniqueViolation(e)) {
        this.log.log(`중복 웹훅 무시: ${provider}/${event.eventId}`);
        return { duplicate: true, applied: false };
      }
      throw e;
    }

    // 2) type 별 원장 반영(각 반영도 idempotency_key 로 이중처리 방지).
    try {
      const applied = await this.dispatch(provider, event);
      await this.prisma.payment_event.update({
        where: { provider_event_id: { provider, event_id: event.eventId } },
        data: { status: applied ? 'processed' : 'ignored', processed_at: new Date() },
      });
      return { duplicate: false, applied };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.payment_event.update({
        where: { provider_event_id: { provider, event_id: event.eventId } },
        data: { status: 'failed', error: msg.slice(0, 500) },
      });
      throw e;
    }
  }

  private async dispatch(provider: string, event: PgWebhookEvent): Promise<boolean> {
    const type: PgWebhookType = event.type;
    if (type === 'payment.paid') {
      if (!event.payerAccountId || !event.amount) {
        this.log.warn(`payment.paid 필수 필드 누락: ${event.eventId}`);
        return false;
      }
      const r = await this.prisma.$transaction((tx) =>
        this.credit.applyPgCharge(tx, {
          studentId: event.payerAccountId!,
          amount: event.amount!,
          provider,
          pgTxnId: event.pgTxnId,
          idempotencyKey: event.idempotencyKey,
        }),
      );
      return r.applied;
    }
    if (type === 'payment.refunded') {
      const r = await this.prisma.$transaction((tx) =>
        this.credit.applyPgRefund(tx, { idempotencyKey: event.idempotencyKey, provider, amount: event.amount }),
      );
      return r.applied;
    }
    // payment.failed — 원장 반영 없음(원 결제가 pending 이었을 뿐). 기록만.
    return false;
  }

  private isUniqueViolation(e: unknown): boolean {
    return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
  }
}
