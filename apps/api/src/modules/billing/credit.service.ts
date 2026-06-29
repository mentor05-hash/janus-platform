import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreditTxnType } from '../../config/enums';
import { consumeCredits, GrantLot } from './domain/credit-consume';

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
  constructor(private readonly prisma: PrismaService) {}

  async getAccount(studentId: string) {
    const acct = await this.prisma.credit_account.findUnique({ where: { student_id: studentId } });
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
    const acct = await this.prisma.credit_account.findUnique({ where: { student_id: studentId } });
    if (!acct) throw new NotFoundException('크레딧 계좌가 없습니다.');
    return this.prisma.credit_transaction.findMany({
      where: { account_id: acct.id },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
  }

  /** 충전(모의 PG). 구매 크레딧 증가 + charge 트랜잭션 기록. */
  async charge(studentId: string, amount: number) {
    return this.prisma.$transaction(async (tx) => {
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
          description: '크레딧 충전(모의 PG)',
          method: 'mock',
        },
      });
      return { purchasedBalance: updated.purchased_balance, grantedBalance: updated.granted_balance };
    });
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
      },
    });
    return { ok: true, shortfall: 0, spent: amount };
  }

  /** 취소 환원(§5-6). 구매분으로 환원 + refund 트랜잭션. */
  async refund(studentId: string, amount: number, ref: { refType: string; refId?: string }) {
    if (amount <= 0) return;
    return this.prisma.$transaction(async (tx) => {
      const acct = await this.lockAccount(tx, studentId);
      const balance = acct.purchased_balance + acct.granted_balance + amount;
      await tx.credit_account.update({
        where: { id: acct.id },
        data: { purchased_balance: { increment: amount } },
      });
      await tx.credit_transaction.create({
        data: {
          account_id: acct.id,
          type: CreditTxnType.REFUND,
          amount,
          balance,
          description: '예약 취소 환원',
          ref_type: ref.refType,
          ref_id: ref.refId ?? null,
        },
      });
    });
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
    return this.prisma.payment_request.create({
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
  }

  /** credit_account 행 잠금(§7 동시성). */
  private async lockAccount(tx: Prisma.TransactionClient, studentId: string) {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM credit_account WHERE student_id = ${studentId}::uuid FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundException('크레딧 계좌가 없습니다.');
    const acct = await tx.credit_account.findUnique({ where: { id: locked[0].id } });
    return acct!;
  }
}
