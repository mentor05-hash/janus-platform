import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { CACHE_PROVIDER } from '../cache/cache.types';
import type { CacheProvider } from '../cache/cache.types';
import { RATE_LIMIT_KEY, RateLimitOptions } from './rate-limit.decorator';

/**
 * Rate limit 가드 (§10 보안) — @RateLimit 가 붙은 핸들러만 제한.
 * 키 = rl:{METHOD路}:{ip}. CacheProvider.incr 로 고정 윈도우 카운트, 초과 시 429.
 * 카운트 실패(캐시 degrade)는 0 반환 → 통과(가용성 우선).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const opts = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!opts || ctx.getType() !== 'http') return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const route = `${req.method}:${req.baseUrl || ''}${req.path}`;
    const key = `rl:${route}:${ip}`;

    const count = await this.cache.incr(key, opts.windowSec);
    if (count > opts.limit) {
      throw new HttpException(
        { message: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.', error: 'too_many_requests' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
