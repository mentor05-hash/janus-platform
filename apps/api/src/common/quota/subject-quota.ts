import { Logger } from '@nestjs/common';
import { CacheProvider } from '../cache/cache.types';
import { kstDay, secondsToKstMidnight } from './usage-quota';

/**
 * **사용자별** 사용량 한도 (B221 — 전역 상한 `UsageQuota` 와 역할이 다르다).
 *
 * 왜 별개인가: B008 의 `UsageQuota` 는 **전역·일** 카운터로 "회사가 오늘 얼마 썼나"를 막는다.
 * 그런데 그것만으로는 두 가지가 안 된다.
 *   ① **남용 방지** — 한 사용자가 공유 예산을 혼자 태워 다른 사람을 굶기는 것을 막지 못한다.
 *   ② **권리 보장** — "VIP 는 월 6건"처럼 판 약속을 사용자 단위로 셀 수 없다.
 * 이 클래스가 그 두 가지를 담당한다. 전역 상한은 마지막 생존선으로 그대로 남는다.
 *
 * 초과 시 의미가 전역 상한과 다르므로 **에러도 다르다**(호출자가 구분해서 응답해야 한다):
 *   - `abuse`       → 429. "잠시 후 다시" — 사용자에게 잘못이 있다기보다 속도 제한이다.
 *   - `entitlement` → 402. "이번 달 한도를 다 썼다" — 상위 등급 안내가 붙는 사업적 경계다.
 *   - (전역 상한)    → 503. "지금 회사가 못 쓴다" — 사용자 잘못이 아니다.
 * 이 셋이 한 코드로 뭉쳐 있던 것이 B221 의 본질이었다.
 */
export type SubjectQuotaKind = 'abuse' | 'entitlement';

export class SubjectQuotaExceededError extends Error {
  constructor(
    public readonly kind: SubjectQuotaKind,
    public readonly feature: string,
    public readonly limit: number,
    /** 기간 단위 — 사용자 안내 문구가 달라진다('오늘' vs '이번 달') */
    public readonly period: QuotaPeriod,
  ) {
    super('SUBJECT_QUOTA_EXCEEDED');
    this.name = 'SubjectQuotaExceededError';
  }
}

export type QuotaPeriod = 'day' | 'month';

/** KST 월(YYYYMM). 구독·정산이 KST 월 경계로 돌아가므로 권리 카운터도 같은 경계를 쓴다. */
export function kstMonth(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  return kst.toISOString().slice(0, 7).replace('-', '');
}

/** KST 월말까지 남은 초 + 여유. 카운터가 월 경계를 넘겨 살아있지 않게. */
export function secondsToKstMonthEnd(now = new Date()): number {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const endOfMonth = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth() + 1,
    1, // 다음 달 1일 00:00 KST
  );
  return Math.max(60, Math.ceil((endOfMonth - kst.getTime()) / 1000) + 60);
}

export class SubjectQuota {
  private readonly logger: Logger;

  constructor(
    private readonly cache: CacheProvider,
    /** 캐시 키 접두어(예: 'llm') */
    private readonly label: string,
    /**
     * 카운터 장애 시 통과시킬지. **기본 true(통과)** — 전역 상한과 반대다.
     *
     * 이유: 비용은 하류의 전역 상한(`UsageQuota`, fail-closed)이 이미 막는다.
     * 여기서까지 막으면 캐시 장애가 곧 "유료 기능 전면 중단"이 된다 —
     * 이미 돈을 받은 권리를 인프라 사정으로 거절하는 셈이라 더 나쁘다.
     * 즉 **비용 보호는 fail-closed, 권리 보장은 fail-open** 으로 층을 나눈다.
     */
    private readonly failOpen = true,
  ) {
    this.logger = new Logger(`SubjectQuota:${label}`);
  }

  private key(feature: string, subjectId: string, period: QuotaPeriod): string {
    const bucket = period === 'month' ? kstMonth() : kstDay();
    return `${this.label}:subject:${feature}:${subjectId}:${bucket}`;
  }

  private ttl(period: QuotaPeriod): number {
    return period === 'month' ? secondsToKstMonthEnd() : secondsToKstMidnight();
  }

  /**
   * 사용자 한 명의 이 기간 사용량을 1 증가시키고 limit 초과면 던진다.
   * limit <= 0 은 **무제한**으로 본다(권리 미설정·한도 미적용 의도).
   */
  async consume(
    kind: SubjectQuotaKind,
    feature: string,
    subjectId: string,
    limit: number,
    period: QuotaPeriod = 'day',
  ): Promise<void> {
    if (limit <= 0) return;
    const used = await this.cache.incr(
      this.key(feature, subjectId, period),
      this.ttl(period),
    );

    // incr 은 최초 호출에 1 을 반환한다 — 0 은 캐시 장애.
    if (used === 0) {
      if (this.failOpen) {
        this.logger.warn(
          `[subject-quota] 카운터 불가(캐시 장애) — 통과: ${feature}. 비용은 전역 상한이 막는다.`,
        );
        return;
      }
      throw new SubjectQuotaExceededError(kind, feature, limit, period);
    }
    if (used > limit) {
      throw new SubjectQuotaExceededError(kind, feature, limit, period);
    }
  }

  /** 잔여 조회 — 증가시키지 않는다. 화면에 "이번 달 3/6 사용" 을 띄우는 용도. */
  async usage(
    feature: string,
    subjectId: string,
    limit: number,
    period: QuotaPeriod = 'day',
  ): Promise<{ used: number; limit: number; remaining: number }> {
    const n = await this.cache.get<number>(
      this.key(feature, subjectId, period),
    );
    const used = typeof n === 'number' ? n : 0;
    return {
      used,
      limit,
      remaining:
        limit <= 0 ? Number.POSITIVE_INFINITY : Math.max(0, limit - used),
    };
  }
}
