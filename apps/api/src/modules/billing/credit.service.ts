import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreditTxnType } from '../../config/enums';
import { NotifyService } from '../notification/notify.service';
import { consumeCredits, GrantLot } from './domain/credit-consume';
import { planRefund, SpendSplit } from './domain/credit-refund';

export interface ConsumeOutcome {
  ok: boolean;
  shortfall: number;
  spent: number;
}

/**
 * 크레딧 계좌·거래 (CLAUDE.md §5-3). 소비 순서는 도메인 함수 consumeCredits 가 결정.
 * 예약/소비는 트랜잭션 + 행잠금(§7)으로 동시성 보호.
 */
@Injectable()
export class CreditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notify: NotifyService,
  ) {}

  /** 기본 초기 크레딧(등급 미상 시 폴백) — Basic 주간부여와 동일. */
  private static readonly DEFAULT_INITIAL_GRANT = 2000;

  /**
   * 크레딧 계좌 조회 — 없으면 생성하고 등급별 초기 크레딧을 부여한다.
   * (신규 가입·HR 등록 학생이 계좌 없이 404 → 무한 로딩 되는 문제 방지.)
   */
  private async ensureAccount(studentId: string) {
    const existing = await this.prisma.credit_account.findUnique({
      where: { student_id: studentId },
    });
    if (existing) return existing;
    // 등급의 주간부여량을 초기 크레딧으로(구독 미가입/등급 미상 시 폴백).
    const sp = await this.prisma.student_profile.findUnique({
      where: { account_id: studentId },
      select: { membership_grade: { select: { weekly_credits: true } } },
    });
    const grant = sp?.membership_grade?.weekly_credits ?? CreditService.DEFAULT_INITIAL_GRANT;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const acct = await tx.credit_account.create({
          data: { student_id: studentId, purchased_balance: 0, granted_balance: grant, reserved_credits: 0 },
        });
        if (grant > 0) {
          await tx.credit_transaction.create({
            data: { account_id: acct.id, type: CreditTxnType.WEEKLY_GRANT, amount: grant, balance: grant, description: '초기 크레딧 부여' },
          });
        }
        return acct;
      });
    } catch {
      // 동시 생성 경합 등 — 재조회로 복구.
      return this.prisma.credit_account.findUnique({ where: { student_id: studentId } });
    }
  }

  async getAccount(studentId: string) {
    const acct = await this.ensureAccount(studentId);
    if (!acct) throw new NotFoundException('크레딧 계좌가 없습니다.');
    return {
      studentId,
      purchasedBalance: acct.purchased_balance,
      grantedBalance: acct.granted_balance,
      reservedCredits: acct.reserved_credits,
      total: acct.purchased_balance + acct.granted_balance,
    };
  }

  async listTransactions(studentId: string, limit = 50) {
    const acct = await this.ensureAccount(studentId);
    if (!acct) return [];
    return this.prisma.credit_transaction.findMany({
      where: { account_id: acct.id },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
  }

  /** 무검증 mock 충전 차단(§ PG 연동 전 무료 크레딧 방지). */
  private assertChargeable() {
    const env = this.config.get<string>('NODE_ENV');
    const pg = this.config.get<string>('PG_PROVIDER') ?? 'mock';
    if (env === 'prod' && pg === 'mock') {
      throw new ForbiddenException(
        '실 결제 연동(PG_PROVIDER) 전에는 충전할 수 없습니다.',
      );
    }
  }

  /** 트랜잭션 내 충전(결제요청 응답 등에서 원자적 처리에 사용). */
  async chargeWithin(
    tx: Prisma.TransactionClient,
    studentId: string,
    amount: number,
    method?: string,
  ) {
    this.assertChargeable();
    const label = method === 'voucher' ? '상품권' : method === 'card' ? '카드' : null;
    const acct = await this.lockAccount(tx, studentId);
    const balance = acct.purchased_balance + acct.granted_balance + amount;
    const updated = await tx.credit_account.update({
      where: { id: acct.id },
      data: { purchased_balance: { increment: amount } },
    });
    await tx.credit_transaction.create({
      data: {
        account_id: acct.id,
        type: CreditTxnType.CHARGE,
        amount,
        balance,
        description: label ? `크레딧 충전(${label}·모의 PG)` : '크레딧 충전(모의 PG)',
        method: method ?? 'mock',
      },
    });
    // 결제 내역(payment) 기록 — /payments/history 노출
    await tx.payment.create({
      data: {
        payer_account_id: studentId,
        amount,
        pg_provider: 'mock',
        target: '충전',
        status: 'done',
      },
    });
    return {
      purchasedBalance: updated.purchased_balance,
      grantedBalance: updated.granted_balance,
    };
  }

  /**
   * PG 확정(웹훅) 충전 — idempotencyKey 로 이중 충전 방지. 이미 처리됐으면 no-op.
   * 실 PG 연결 시 웹훅 핸들러가 호출. payment.idempotency_key UNIQUE 로 경합도 방지.
   */
  async applyPgCharge(
    tx: Prisma.TransactionClient,
    input: { studentId: string; amount: number; provider: string; pgTxnId?: string; idempotencyKey: string },
  ): Promise<{ applied: boolean }> {
    const existing = await tx.payment.findUnique({ where: { idempotency_key: input.idempotencyKey } });
    if (existing) return { applied: false }; // 이미 반영됨(멱등)
    const acct = await this.lockAccount(tx, input.studentId);
    const balance = acct.purchased_balance + acct.granted_balance + input.amount;
    await tx.credit_account.update({ where: { id: acct.id }, data: { purchased_balance: { increment: input.amount } } });
    await tx.credit_transaction.create({
      data: { account_id: acct.id, type: CreditTxnType.CHARGE, amount: input.amount, balance, description: `크레딧 충전(${input.provider} PG)`, method: input.provider },
    });
    await tx.payment.create({
      data: { payer_account_id: input.studentId, amount: input.amount, pg_provider: input.provider, pg_txn_id: input.pgTxnId ?? null, target: '충전', status: 'done', idempotency_key: input.idempotencyKey },
    });
    return { applied: true };
  }

  /**
   * PG 환불(웹훅) — 원 충전(payment)을 되돌림. refunded_at 로 이중 환불 방지.
   * 구매 크레딧을 차감(0 미만 방지)하고 payment.refunded_at 을 찍는다.
   */
  async applyPgRefund(
    tx: Prisma.TransactionClient,
    input: { idempotencyKey: string; provider: string; amount?: number },
  ): Promise<{ applied: boolean }> {
    const payment = await tx.payment.findUnique({ where: { idempotency_key: input.idempotencyKey } });
    if (!payment || payment.refunded_at) return { applied: false }; // 원결제 없음/이미 환불(멱등)
    const amount = input.amount ?? payment.amount;
    const acct = await this.lockAccount(tx, payment.payer_account_id);
    const dec = Math.min(amount, acct.purchased_balance); // 이미 사용된 분은 차감 불가 — 잔액까지만
    const updated = await tx.credit_account.update({ where: { id: acct.id }, data: { purchased_balance: { decrement: dec } } });
    await tx.credit_transaction.create({
      data: { account_id: acct.id, type: CreditTxnType.REFUND, amount: dec, balance: updated.purchased_balance + updated.granted_balance, description: `충전 환불(${input.provider} PG)`, ref_type: 'pg_refund', ref_id: payment.id },
    });
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'refunded', refunded_at: new Date() } });
    return { applied: true };
  }

  /** 결제 내역(GET /payments/history) — 본인 결제(payment) 목록. */
  paymentHistory(payerId: string) {
    return this.prisma.payment.findMany({
      where: { payer_account_id: payerId },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
  }

  /** 충전(모의 PG). 구매 크레딧 증가 + charge 트랜잭션 기록. */
  async charge(studentId: string, amount: number, method?: string) {
    this.assertChargeable();
    return this.prisma.$transaction((tx) =>
      this.chargeWithin(tx, studentId, amount, method),
    );
  }

  /**
   * 트랜잭션 내 크레딧 소비(예약 흐름에서 호출). 부족하면 쓰기 없이 ok:false.
   * @param tx  진행 중인 Prisma 트랜잭션 클라이언트(예약과 원자적 처리)
   */
  async consumeWithin(
    tx: Prisma.TransactionClient,
    studentId: string,
    amount: number,
    ref: { refType: string; refId?: string; description?: string },
  ): Promise<ConsumeOutcome> {
    const acct = await this.lockAccount(tx, studentId);
    const grants = await tx.weekly_credit_grant.findMany({
      where: { account_id: acct.id, remaining: { gt: 0 } },
      orderBy: { expire_at: 'asc' },
    });
    const lots: GrantLot[] = grants.map((g) => ({
      id: g.id,
      remaining: g.remaining,
      expireAt: g.expire_at.getTime(),
    }));

    const plan = consumeCredits(lots, acct.purchased_balance, amount);
    if (plan.shortfall > 0) {
      return { ok: false, shortfall: plan.shortfall, spent: 0 };
    }

    // 부여분 차감
    let grantedUsed = 0;
    for (const g of plan.grantSpend) {
      await tx.weekly_credit_grant.update({
        where: { id: g.id },
        data: { remaining: { decrement: g.used } },
      });
      grantedUsed += g.used;
    }
    const newGranted = acct.granted_balance - grantedUsed;
    const newPurchased = acct.purchased_balance - plan.purchasedSpend;

    await tx.credit_account.update({
      where: { id: acct.id },
      data: { granted_balance: newGranted, purchased_balance: newPurchased },
    });

    const balanceAfter = newGranted + newPurchased;
    await tx.credit_transaction.create({
      data: {
        account_id: acct.id,
        type: CreditTxnType.SPEND,
        amount: -amount,
        balance: balanceAfter,
        description: ref.description ?? '상담 예약 크레딧 차감',
        ref_type: ref.refType,
        ref_id: ref.refId ?? null,
        // 분배 내역 기록(M4) — 환원 시 원래 버킷 복원에 사용
        meta: {
          grantSpend: plan.grantSpend,
          purchasedSpend: plan.purchasedSpend,
        },
      },
    });
    return { ok: true, shortfall: 0, spent: amount };
  }

  /**
   * 취소 환원(§5-6, M4) — 소비 분배(meta)를 읽어 원래 버킷으로 복원.
   * 살아있는 부여 lot 은 lot 복원, 만료분·구매분은 구매분으로. 진행 중 트랜잭션 내 실행.
   */
  async refundWithin(
    tx: Prisma.TransactionClient,
    studentId: string,
    amount: number,
    ref: { refType: string; refId?: string },
  ) {
    if (amount <= 0) return;
    const acct = await this.lockAccount(tx, studentId);

    // 원 소비 트랜잭션의 분배 내역 조회(없으면 전액 구매분 환원)
    let split: SpendSplit | null = null;
    if (ref.refId) {
      const spend = await tx.credit_transaction.findFirst({
        where: {
          account_id: acct.id,
          type: CreditTxnType.SPEND,
          ref_id: ref.refId,
        },
        orderBy: { created_at: 'desc' },
      });
      split = (spend?.meta as unknown as SpendSplit) ?? null;
    }
    const lotIds = (split?.grantSpend ?? []).map((g) => g.id);
    const lots = lotIds.length
      ? await tx.weekly_credit_grant.findMany({ where: { id: { in: lotIds } } })
      : [];
    const lotExpiry: Record<string, number> = {};
    for (const l of lots) lotExpiry[l.id] = l.expire_at.getTime();

    const refundPlan = planRefund(split, lotExpiry, Date.now(), amount);

    let grantedInc = 0;
    for (const r of refundPlan.grantRestores) {
      await tx.weekly_credit_grant.update({
        where: { id: r.id },
        data: { remaining: { increment: r.amount } },
      });
      grantedInc += r.amount;
    }
    const newGranted = acct.granted_balance + grantedInc;
    const newPurchased = acct.purchased_balance + refundPlan.toPurchased;
    await tx.credit_account.update({
      where: { id: acct.id },
      data: { granted_balance: newGranted, purchased_balance: newPurchased },
    });
    await tx.credit_transaction.create({
      data: {
        account_id: acct.id,
        type: CreditTxnType.REFUND,
        amount,
        balance: newGranted + newPurchased,
        description: '예약 취소 환원',
        ref_type: ref.refType,
        ref_id: ref.refId ?? null,
        meta: {
          grantRestores: refundPlan.grantRestores,
          toPurchased: refundPlan.toPurchased,
        },
      },
    });
  }

  /** 취소 환원(독립 트랜잭션 래퍼). */
  async refund(
    studentId: string,
    amount: number,
    ref: { refType: string; refId?: string },
  ) {
    if (amount <= 0) return;
    return this.prisma.$transaction((tx) =>
      this.refundWithin(tx, studentId, amount, ref),
    );
  }

  /** 잔액 부족 시 결제요청 생성(§5-6 / 결제요청 경로). */
  async createPaymentRequest(
    studentId: string,
    neededCredits: number,
    ref: { refType: string; refId?: string },
  ) {
    const guardianLink = await this.prisma.guardian_student_link.findFirst({
      where: { student_id: studentId, status: 'approved' },
    });
    const pr = await this.prisma.payment_request.create({
      data: {
        student_id: studentId,
        guardian_id: guardianLink?.guardian_id ?? null,
        needed_credits: neededCredits,
        ref_type: ref.refType,
        ref_id: ref.refId ?? null,
        status: 'open',
        origin: 'auto',
      },
      select: { id: true, needed_credits: true, status: true },
    });
    // 충전(결제) 요청 → 보호자(없으면 학생 본인) 알림
    await this.notify.notify(
      guardianLink?.guardian_id ?? studentId,
      'payment_requested',
      {
        requestId: pr.id,
        studentId,
        neededCredits,
      },
    );
    return pr;
  }

  /** credit_account 행 잠금(§7 동시성). */
  private async lockAccount(tx: Prisma.TransactionClient, studentId: string) {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM credit_account WHERE student_id = ${studentId}::uuid FOR UPDATE`;
    if (locked.length === 0)
      throw new NotFoundException('크레딧 계좌가 없습니다.');
    const acct = await tx.credit_account.findUnique({
      where: { id: locked[0].id },
    });
    return acct!;
  }
}
