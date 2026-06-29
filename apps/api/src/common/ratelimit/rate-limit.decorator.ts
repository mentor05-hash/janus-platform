import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitOptions {
  /** 윈도우 내 허용 요청 수 */
  limit: number;
  /** 윈도우(초) */
  windowSec: number;
}

/**
 * 엔드포인트 rate limit (§10 보안) — IP+라우트 기준 고정 윈도우.
 * 메타데이터만 부여하고 실제 카운팅/차단은 RateLimitGuard 가 수행(CacheProvider 기반).
 */
export const RateLimit = (opts: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, opts);
