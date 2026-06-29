import { Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { CacheProvider } from './cache.types';

/**
 * Redis 캐시(§10) — 다중 인스턴스 수평확장용 외부 캐시. 값은 JSON 직렬화.
 * REDIS_URL 로 연결. 장애 시 캐시 미스로 degrade(원본 DB 조회로 진행).
 */
export class RedisCacheProvider implements CacheProvider, OnModuleDestroy {
  private readonly logger = new Logger('CacheProvider:redis');
  private readonly redis: Redis;

  constructor(url: string) {
    this.redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    this.redis.on('error', (e) => this.logger.warn(`redis error: ${e.message}`));
    void this.redis.connect().catch((e) => this.logger.warn(`redis connect 실패: ${e.message}`));
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null; // degrade
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* degrade: 캐시 실패는 무시 */
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch {
      /* degrade */
    }
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    try {
      const n = await this.redis.incr(key);
      if (n === 1) await this.redis.expire(key, ttlSeconds);
      return n;
    } catch {
      return 0; // degrade: 카운트 불가 시 제한하지 않음(가용성 우선)
    }
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }
}
