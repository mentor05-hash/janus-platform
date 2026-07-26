import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import { withCronLock } from '../../common/cache/cron-lock';
import { computeNextBilling } from '../membership/domain/billing-cycle';
import { PG_PROVIDER } from './pg/pg.types';
import type { PgProvider } from './pg/pg.types';

/**
 * 구독 정기결제(autopay) 스케줄러 (CLAUDE.md §membership·§9 O2·§10).
 * next_billing_at 도래 구독을 PgProvider 로 청구하고 다음 결제일로 이월.
 * 청구 전 next_billing_at 을 조건부로 "선점"해 동시 실행·중복 청구를 방지(§7).
 */
@Injectable()
export class AutopayService {
  private readonly logger = new Logger(AutopayService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PG_PROVIDER) private readonly pg: PgProvider,
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
  ) {}

  @Cron(process.env.SUBSCRIPTION_BILLING_CRON ?? '0 1 * * *', {
    timeZone: 'Asia/Seoul',
  })
  async scheduledBilling() {
    await withCronLock(
      this.cache,
      'subscription-billing',
      600,
      async () => {
        const r = await this.runDue();
        this.logger.log(`정기결제 처리: 성공 ${r.charged} / 실패 ${r.failed}`);
      },
      this.logger,
    );
  }

  /** 도래한 구독을 청구. 반환: {charged, failed}. now 주입 가능(테스트). */
  async runDue(now = new Date()): Promise<{ charged: number; failed: number }> {
    const due = await this.prisma.student_subscription.findMany({
      where: { status: 'active', next_billing_at: { not: null, lte: now } },
      include: { subscription_plan: true },
    });
    let charged = 0;
    let failed = 0;
    for (const sub of due) {
      const due_at = sub.next_billing_at!;
      const plan = sub.subscription_plan;
      const nextAt = computeNextBilling(plan.billing_cycle, due_at);

      // 선점: 아직 '도래(<= now)' 상태일 때만 다음 결제일로 조건부 이월.
      // 정확한 timestamp 일치(= due_at) 대신 lte 비교 → DB측 now() 등으로 들어온
      // 마이크로초 값이 JS Date(ms) 왕복에서 어긋나도 안전(결제 누락 방지). 동시 실행은
      // 이미 미래로 이월된 행을 lte 로 거르므로 중복 청구 없음(§7).
      const claim = await this.prisma.student_subscription.updateMany({
        where: {
          id: sub.id,
          status: 'active',
          next_billing_at: { not: null, lte: now },
        },
        data: { next_billing_at: nextAt },
      });
      if (claim.count !== 1) continue;

      const payerAccountId = await this.resolvePayer(
        sub.student_id,
        plan.payer,
      );
      const idempotencyKey = `${sub.id}:${due_at.toISOString()}`;
      let result;
      try {
        result = await this.pg.charge({
          payerAccountId,
          amount: plan.price,
          purpose: 'subscription',
          idempotencyKey,
        });
      } catch (e) {
        result = { transactionId: '', status: 'failed' as const };
        this.logger.warn(
          `정기결제 청구 오류(sub=${sub.id}): ${(e as Error).message}`,
        );
      }

      if (result.status === 'done') {
        await this.prisma.payment.create({
          data: {
            payer_account_id: payerAccountId,
            amount: plan.price,
            pg_provider: process.env.PG_PROVIDER ?? 'mock',
            pg_txn_id: result.transactionId,
            target: '구독 정기결제',
            status: 'done',
          },
        });
        charged++;
      } else {
        // 실패 → 선점 롤백(다음 실행에서 재시도) + 실패 결제 기록
        await this.prisma.student_subscription.updateMany({
          where: { id: sub.id, next_billing_at: nextAt },
          data: { next_billing_at: due_at },
        });
        await this.prisma.payment.create({
          data: {
            payer_account_id: payerAccountId,
            amount: plan.price,
            pg_provider: process.env.PG_PROVIDER ?? 'mock',
            target: '구독 정기결제',
            status: 'failed',
          },
        });
        failed++;
      }
    }
    return { charged, failed };
  }

  /** 결제자 계좌 해석: student 플랜은 학생, guardian 플랜은 승인된 보호자(없으면 학생 fallback). */
  private async resolvePayer(
    studentId: string,
    payer: string,
  ): Promise<string> {
    if (payer === 'guardian') {
      const link = await this.prisma.guardian_student_link.findFirst({
        where: { student_id: studentId, status: 'approved' },
      });
      if (link) return link.guardian_id;
    }
    return studentId;
  }
}
