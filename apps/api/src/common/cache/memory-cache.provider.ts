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

  async incr(key: string, ttlSeconds: number): Promise<number> {
    // 단일 스레드 JS — get/set 사이 경합 없음(원자적).
    const e = this.store.get(key);
    const now = Date.now();
    if (!e || e.expiresAt <= now) {
      this.store.set(key, { value: 1, expiresAt: now + ttlSeconds * 1000 });
      return 1;
    }
    const next = (e.value as number) + 1;
    e.value = next; // 만료시각은 최초 증가 기준 유지(고정 윈도우)
    return next;
  }
}
