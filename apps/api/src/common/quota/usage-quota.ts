import { Logger } from '@nestjs/common';
import { CacheProvider } from '../cache/cache.types';

/**
 * 유료 외부 API 호출량 상한 (실행계획서 §비용 — "상한/알람 설정 후 공개").
 * CacheProvider.incr 로 일 단위 카운터를 돌린다. mock 어댑터는 비용이 0이므로 감싸지 않는다.
 */
export class QuotaExceededError extends Error {
  constructor(
    public readonly scope: string,
    public readonly limit: number,
    /** 카운터를 읽을 수 없어 차단한 경우(사용량 초과가 아님) */
    public readonly counterUnavailable = false,
  ) {
    super('AI_QUOTA_EXCEEDED');
    this.name = 'QuotaExceededError';
  }
}

/** KST 일자(YYYYMMDD) — 운영자가 "오늘 얼마 썼나"를 KST 로 인지하므로 카운터 경계도 KST. */
function kstDay(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  return kst.toISOString().slice(0, 10).replace(/-/g, '');
}

/** KST 자정까지 남은 초 + 여유 60초 — 카운터가 일자 경계를 넘겨 살아있지 않게. */
function secondsToKstMidnight(now = new Date()): number {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const endOfDay = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate() + 1,
  );
  return Math.max(60, Math.ceil((endOfDay - kst.getTime()) / 1000) + 60);
}

export class UsageQuota {
  private readonly logger: Logger;

  constructor(
    private readonly cache: CacheProvider,
    /** 캐시 키·로그 접두어(예: 'llm', 'media') */
    private readonly label: string,
    /** 카운터 장애 시 통과시킬지. 기본 false = 차단 — 비용 폭주가 가용성보다 큰 리스크. */
    private readonly failOpen = false,
    /** 이 비율 도달 시 경고 로그(일·스코프별 1회) */
    private readonly warnRatio = 0.8,
  ) {
    this.logger = new Logger(`UsageQuota:${label}`);
  }

  /**
   * scope 의 오늘 사용량을 1 증가시키고 limit 초과면 던진다.
   * limit <= 0 이면 해당 스코프를 무제한으로 본다(상한 미설정 의도).
   */
  async consume(scope: string, limit: number): Promise<void> {
    return this.consumeUnits(scope, 1, limit);
  }

  /**
   * 한 번의 사용이 여러 단위를 소모할 때(예: STT 는 **분** 단위 과금).
   * 호출 수로만 세면 상한이 길이에 무감각해진다 — 30초 60건과 60분 60건이 같아진다.
   *
   * **선(先)과금**이다: 실제 호출 전에 units 를 먼저 더한다. 뒤에 더하면 상한을 넘긴
   * 만큼은 이미 과금된 뒤이므로 상한이 사후 통보가 된다.
   */
  async consumeUnits(
    scope: string,
    units: number,
    limit: number,
    /** 경고·초과 로그에 쓸 단위 이름. 기본 '회'. */
    unit = '회',
  ): Promise<void> {
    if (limit <= 0) return;
    const amount = Math.max(1, Math.ceil(units));
    const key = `${this.label}:quota:${scope}:${kstDay()}`;
    const used = await this.cache.incrBy(key, amount, secondsToKstMidnight());

    // incrBy 는 최초 호출에 amount(≥1)를 반환한다 — 0 은 캐시 장애(RedisCacheProvider degrade).
    if (used === 0) {
      if (this.failOpen) {
        this.logger.warn(
          `[quota] 카운터 불가(캐시 장애) — failOpen 설정으로 통과: scope=${scope}`,
        );
        return;
      }
      this.logger.error(
        `[quota] 카운터 불가(캐시 장애) — 비용 보호를 위해 차단: scope=${scope}`,
      );
      throw new QuotaExceededError(scope, limit, true);
    }

    if (used > limit) {
      await this.alarm(scope, used, limit, 'exceeded', unit);
      throw new QuotaExceededError(scope, limit);
    }
    if (used >= Math.ceil(limit * this.warnRatio)) {
      await this.alarm(scope, used, limit, 'warn', unit);
    }
  }

  /** 관리자 조회용 — 카운터를 증가시키지 않고 오늘 사용량만 본다. */
  async peek(scope: string): Promise<number> {
    const n = await this.cache.get<number>(
      `${this.label}:quota:${scope}:${kstDay()}`,
    );
    return typeof n === 'number' ? n : 0;
  }

  /** 경고가 그 자체로 비용을 만들지 않도록 일·스코프·종류별 1회로 억제. */
  private async alarm(
    scope: string,
    used: number,
    limit: number,
    kind: 'warn' | 'exceeded',
    unit = '회',
  ): Promise<void> {
    const seen = `${this.label}:quota:alarm:${kind}:${scope}:${kstDay()}`;
    if (!(await this.cache.acquireLock(seen, secondsToKstMidnight()))) return;
    const msg = `[quota:${kind}] ${this.label}/${scope} 오늘 ${used}/${limit} ${unit}`;
    if (kind === 'exceeded')
      this.logger.error(`${msg} — 상한 도달로 호출을 차단합니다.`);
    else
      this.logger.warn(
        `${msg} — 상한의 ${Math.round(this.warnRatio * 100)}% 를 넘었습니다.`,
      );
  }
}

/** ENV 정수 파싱 — 미설정·비정상값이면 기본값. */
export function envInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export { kstDay, secondsToKstMidnight };
