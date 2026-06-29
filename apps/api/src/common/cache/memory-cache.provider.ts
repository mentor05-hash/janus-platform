import { Injectable } from '@nestjs/common';
import { CacheProvider } from './cache.types';

interface Entry {
  value: unknown;
  expiresAt: number;
}

/**
 * In-process 메모리 캐시(§10) — 단일 인스턴스/테스트 기본.
 * 다중 인스턴스 수평확장 시에는 RedisCacheProvider 로 교체(ENV).
 */
@Injectable()
export class MemoryCacheProvider implements CacheProvider {
  private store = new Map<string, Entry>();

  async get<T>(key: string): Promise<T | null> {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return e.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}
