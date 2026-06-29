import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreditTxnType } from '../../config/enums';

/**
 * 주간 크레딧 부여/소멸 스케줄러 (CLAUDE.md §5-3).
 * 월요일 00:00(KST) 부여 / 일요일 24:00 직전 소멸. 이월 없음.
 * cron 식은 ENV(WEEKLY_GRANT_CRON·GRANT_EXPIRE_CRON), 타임존 Asia/Seoul.
 */
@Injectable()
export class WeeklyGrantService {
  private readonly logger = new Logger(WeeklyGrantService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(process.env.WEEKLY_GRANT_CRON ?? '0 0 * * 1', { timeZone: 'Asia/Seoul' })
  async scheduledGrant() {
    const n = await this.runGrant();
    this.logger.log(`주간 부여 완료: ${n}건`);
  }

  @Cron(process.env.GRANT_EXPIRE_CRON ?? '59 23 * * 0', { timeZone: 'Asia/Seoul' })
  async scheduledExpire() {
    const n = await this.runExpire();
    this.logger.log(`주간 소멸 완료: ${n}건`);
  }

  /**
   * 등급별 weekly_credits 를 학생 계좌에 부여(이번 주 일요일 24:00 만료).
   * @param onlyStudentId 지정 시 해당 학생만(운영 단일 재부여·테스트 격리용).
   */
  async runGrant(now = new Date(), onlyStudentId?: string): Promise<number> {
    const expireAt = endOfWeekKst(now);
    const students = await this.prisma.student_profile.findMany({
      where: {
        membership_grade_id: { not: null },
        ...(onlyStudentId ? { account_id: onlyStudentId } : {}),
      },
      include: { membership_grade: true },
    });
    let count = 0;
    for (const s of students) {
      const weekly = s.membership_grade?.weekly_credits ?? 0;
      if (weekly <= 0) continue;
      const acct = await this.prisma.credit_account.findUnique({ where: { student_id: s.account_id } });
      if (!acct) continue;
      await this.prisma.$transaction(async (tx) => {
        await tx.weekly_credit_grant.create({
          data: {
            account_id: acct.id,
            grade_id: s.membership_grade_id,
            amount: weekly,
            expire_at: expireAt,
            remaining: weekly,
          },
        });
        const updated = await tx.credit_account.update({
          where: { id: acct.id },
          data: { granted_balance: { increment: weekly }, grant_expire_at: expireAt },
        });
        await tx.credit_transaction.create({
          data: {
            account_id: acct.id,
            type: CreditTxnType.WEEKLY_GRANT,
            amount: weekly,
            balance: updated.purchased_balance + updated.granted_balance,
            description: '주간 크레딧 부여',
          },
        });
      });
      count++;
    }
    return count;
  }

  /** 남은 부여분을 소멸(이월 없음). onlyStudentId 지정 시 해당 학생 계좌만. */
  async runExpire(now = new Date(), onlyStudentId?: string): Promise<number> {
    let accountId: string | undefined;
    if (onlyStudentId) {
      const acct = await this.prisma.credit_account.findUnique({ where: { student_id: onlyStudentId } });
      if (!acct) return 0;
      accountId = acct.id;
    }
    const grants = await this.prisma.weekly_credit_grant.findMany({
      where: {
        remaining: { gt: 0 },
        expire_at: { lte: now },
        ...(accountId ? { account_id: accountId } : {}),
      },
    });
    let count = 0;
    for (const g of grants) {
      await this.prisma.$transaction(async (tx) => {
        const acct = await tx.credit_account.findUnique({ where: { id: g.account_id } });
        if (!acct) return;
        const newGranted = Math.max(0, acct.granted_balance - g.remaining);
        await tx.weekly_credit_grant.update({ where: { id: g.id }, data: { remaining: 0 } });
        const updated = await tx.credit_account.update({
          where: { id: acct.id },
          data: { granted_balance: newGranted },
        });
        await tx.credit_transaction.create({
          data: {
            account_id: acct.id,
            type: CreditTxnType.WEEKLY_EXPIRE,
            amount: -g.remaining,
            balance: updated.purchased_balance + updated.granted_balance,
            description: '주간 크레딧 소멸(이월 없음)',
          },
        });
      });
      count++;
    }
    return count;
  }
}

/**
 * 해당 주 일요일 23:59:00(KST) — 소멸 cron(`59 23 * * 0`)과 동일 시각.
 * (이전 구현은 다음 월요일 00:00 으로 두어 일요일 23:59 소멸 런이 `expire_at <= now` 를
 *  만족하지 못해 한 주치가 다음 주까지 살아남아 2주 중복되는 off-by-one 이 있었음.)
 */
export function endOfWeekKst(now: Date): Date {
  const KST = 9 * 60 * 60 * 1000;
  const k = new Date(now.getTime() + KST);
  const dow = k.getUTCDay(); // 0=일 .. 6=토
  const daysUntilSun = (7 - dow) % 7; // 일요일이면 0(당일)
  const sunMidnightKstAsUtc = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() + daysUntilSun);
  const expireKst = sunMidnightKstAsUtc + (23 * 60 + 59) * 60 * 1000; // 일 23:59:00 KST
  return new Date(expireKst - KST);
}
