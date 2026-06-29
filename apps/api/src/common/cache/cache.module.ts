import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_PROVIDER } from './cache.types';
import { MemoryCacheProvider } from './memory-cache.provider';
import { RedisCacheProvider } from './redis-cache.provider';

/**
 * 캐시 모듈 (CLAUDE.md §10) — 전역. ENV CACHE_PROVIDER=redis 면 Redis(REDIS_URL),
 * 그 외(기본)는 in-process 메모리. 어디서나 CACHE_PROVIDER 토큰으로 주입.
 */
@Global()
@Module({
  providers: [
    {
      provide: CACHE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const which = config.get<string>('CACHE_PROVIDER') ?? 'memory';
        if (which === 'redis') {
          return new RedisCacheProvider(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379');
        }
        return new MemoryCacheProvider();
      },
    },
  ],
  exports: [CACHE_PROVIDER],
})
export class CacheModule {}
