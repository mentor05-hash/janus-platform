/**
 * CacheProvider 어댑터 (CLAUDE.md §10 — 캐시 외부화, stateless).
 * 로컬/테스트는 in-process 메모리, 클라우드는 Redis(REDIS_URL) — 코드 변경 없이 ENV 전환.
 */
export const CACHE_PROVIDER = Symbol('CACHE_PROVIDER');

export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  /** 원자적 증가(rate limit 등). 최초 증가 시 ttlSeconds 만료 설정. 증가 후 값 반환. */
  incr(key: string, ttlSeconds: number): Promise<number>;
}
