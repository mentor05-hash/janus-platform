import { Logger } from '@nestjs/common';
import type { CacheProvider } from './cache.types';

/**
 * 크론 리더락(§10 수평 확장) — 다중 인스턴스에서 스케줄 잡이 동시에 뜰 때
 * 락을 획득한 1개 인스턴스만 실행. 락은 TTL 동안 유지되어 같은 발사창의 중복을 막는다.
 * (도메인 멱등성과 이중 방어: 락 실패해도 per-row 멱등 로직이 최종 안전판)
 */
export async function withCronLock(
  cache: CacheProvider,
  name: string,
  ttlSeconds: number,
  fn: () => Promise<void>,
  logger = new Logger('CronLock'),
): Promise<void> {
  const acquired = await cache.acquireLock(`cronlock:${name}`, ttlSeconds);
  if (!acquired) {
    logger.log(`[${name}] 다른 인스턴스가 이미 실행 — 건너뜀(리더락)`);
    return;
  }
  await fn();
}
