import { BadRequestException, Body, Controller, Headers, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { PgWebhookService } from './pg-webhook.service';
import { PgWebhookEvent, PgWebhookType } from './pg.types';

const TYPES: PgWebhookType[] = ['payment.paid', 'payment.failed', 'payment.refunded'];

/**
 * PG 웹훅 수신 엔드포인트 (CLAUDE.md §9 O2).
 * POST /api/v1/billing/pg/webhook/:provider — 공개(서명검증으로 인증). 벤더 페이로드를
 * PgWebhookEvent 로 정규화해 서비스에 넘긴다. 실 PG 연동 시 provider 별 매핑만 확장.
 */
@Controller('billing/pg/webhook')
export class PgWebhookController {
  constructor(private readonly svc: PgWebhookService) {}

  @Public()
  @Post(':provider')
  async receive(
    @Param('provider') provider: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-pg-signature') signature: string | undefined,
    @Body() body: Record<string, unknown>,
  ): Promise<{ ok: true; duplicate: boolean; applied: boolean }> {
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(body ?? {});
    if (!this.svc.verifySignature(raw, signature)) {
      throw new UnauthorizedException('웹훅 서명 검증 실패');
    }
    const event = this.normalize(body);
    const r = await this.svc.handle(provider, event);
    return { ok: true, ...r };
  }

  /** 벤더 페이로드 → 정규화 이벤트. (데모는 이미 정규화 형태를 그대로 수신) */
  private normalize(body: Record<string, unknown>): PgWebhookEvent {
    const eventId = String(body.eventId ?? body.id ?? '');
    const type = body.type as PgWebhookType;
    const idempotencyKey = String(body.idempotencyKey ?? body.orderId ?? '');
    if (!eventId || !TYPES.includes(type) || !idempotencyKey) {
      throw new BadRequestException('필수 필드 누락(eventId/type/idempotencyKey)');
    }
    const amount = body.amount != null ? Number(body.amount) : undefined;
    return {
      eventId,
      type,
      idempotencyKey,
      payerAccountId: body.payerAccountId ? String(body.payerAccountId) : undefined,
      amount: Number.isFinite(amount) ? amount : undefined,
      pgTxnId: body.pgTxnId ? String(body.pgTxnId) : undefined,
    };
  }
}
