import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CACHE_PROVIDER } from '../../common/cache/cache.types';
import type { CacheProvider } from '../../common/cache/cache.types';
import { withCronLock } from '../../common/cache/cron-lock';
import { CreditTxnType } from '../../config/enums';
import { resolveStudentType } from '../../common/student-type';

/**
 * 주간 크레딧 부여/소멸 스케줄러 (CLAUDE.md §5-3).
 * 월요일 00:00(KST) 부여 / 일요일 24:00 직전 소멸. 이월 없음.
 * cron 식은 ENV(WEEKLY_GRANT_CRON·GRANT_EXPIRE_CRON), 타임존 Asia/Seoul.
 */
@Injectable()
export class WeeklyGrantService {
  private readonly logger = new Logger(WeeklyGrantService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
  ) {}

  @Cron(process.env.WEEKLY_GRANT_CRON ?? '0 0 * * 1', {
    timeZone: 'Asia/Seoul',
  })
  async scheduledGrant() {
    await withCronLock(
      this.cache,
      'weekly-grant',
      600,
      async () => {
        const n = await this.runGrant();
        this.logger.log(`주간 부여 완료: ${n}건`);
      },
      this.logger,
    );
  }

  @Cron(process.env.GRANT_EXPIRE_CRON ?? '59 23 * * 0', {
    timeZone: 'Asia/Seoul',
  })
  async scheduledExpire() {
    await withCronLock(
      this.cache,
      'weekly-expire',
      600,
      async () => {
        const n = await this.runExpire();
        this.logger.log(`주간 소멸 완료: ${n}건`);
      },
      this.logger,
    );
  }

  /**
   * 등급별 weekly_credits 를 학생 계좌에 부여(이번 주 일요일 24:00 만료).
   * @param onlyStudentId 지정 시 해당 학생만(운영 단일 재부여·테스트 격리용).
   */
  async runGrant(now = new Date(), onlyStudentId?: string): Promise<number> {
    // 만료(=소멸) 시각은 등급별 expire_policy 로 결정(주말/월말). 아래 루프에서 등급마다 계산.
    // 외부학생 주간 크레딧 부여 정책(마스터 설정) — 기본 제외
    const extRow = await this.prisma.system_setting.findUnique({
      where: { key: 'external_student_policy' },
    });
    const extWeeklyGrant =
      (extRow?.value as { weeklyGrant?: boolean } | null)?.weeklyGrant ?? false;
    const students = await this.prisma.student_profile.findMany({
      where: {
        membership_grade_id: { not: null },
        ...(onlyStudentId ? { account_id: onlyStudentId } : {}),
      },
      include: { membership_grade: true },
    });
    let count = 0;
    for (const s of students) {
      // 외부학생은 정책상 주간 크레딧 부여 제외(정책 on 이면 부여)
      if (!extWeeklyGrant && resolveStudentType(s) === 'external') continue;
      const weekly = s.membership_grade?.weekly_credits ?? 0;
      if (weekly <= 0) continue;
      // 등급별 만료: 월간 풀(월말 소멸) vs 주간(주말 소멸). 월간이면 dup 검사(같은 expire_at)로
      // 자동 월 1회만 부여됨(주간 cron 이 재실행돼도 이미 있는 월말 lot 발견 → 스킵).
      const expireAt =
        s.membership_grade?.expire_policy === 'end_of_month'
          ? endOfMonthKst(now)
          : endOfWeekKst(now);
      const acct = await this.prisma.credit_account.findUnique({
        where: { student_id: s.account_id },
      });
      if (!acct) continue;
      // 멱등(L2): 이번 기간 부여분이 이미 있으면 중복 부여 방지(cron 중복 실행/수동 재실행)
      const dup = await this.prisma.weekly_credit_grant.findFirst({
        where: { account_id: acct.id, expire_at: expireAt },
      });
      if (dup) continue;
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
          data: {
            granted_balance: { increment: weekly },
            grant_expire_at: expireAt,
          },
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
      const acct = await this.prisma.credit_account.findUnique({
        where: { student_id: onlyStudentId },
      });
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
        const acct = await tx.credit_account.findUnique({
          where: { id: g.account_id },
        });
        if (!acct) return;
        const newGranted = Math.max(0, acct.granted_balance - g.remaining);
        await tx.weekly_credit_grant.update({
          where: { id: g.id },
          data: { remaining: 0 },
        });
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
  const sunMidnightKstAsUtc = Date.UTC(
    k.getUTCFullYear(),
    k.getUTCMonth(),
    k.getUTCDate() + daysUntilSun,
  );
  const expireKst = sunMidnightKstAsUtc + (23 * 60 + 59) * 60 * 1000; // 일 23:59:00 KST
  return new Date(expireKst - KST);
}

/**
 * 해당 월 말일 23:59:00(KST) — 월간 풀(상위 등급) 소멸 시각.
 * 다음 달 1일 00:00 KST 에서 1분을 빼 "말일 23:59:00 KST"를 만든다(주말 헬퍼와 동일한 방식).
 */
export function endOfMonthKst(now: Date): Date {
  const KST = 9 * 60 * 60 * 1000;
  const k = new Date(now.getTime() + KST);
  const firstNextMonthKstAsUtc = Date.UTC(
    k.getUTCFullYear(),
    k.getUTCMonth() + 1,
    1,
  ); // 다음 달 1일 00:00 KST
  const expireKst = firstNextMonthKstAsUtc - 60 * 1000; // 말일 23:59:00 KST
  return new Date(expireKst - KST);
}
