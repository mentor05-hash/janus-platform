import { CacheProvider } from '../../common/cache/cache.types';

/**
 * 요금 정책 캐시 키/무효화 (§10). 버전 기반 무효화: 어떤 요금 변경이든 버전을 올리면
 * 이전 버전 키가 모두 무효(다음 조회는 미스→DB). 단순 get/set 만으로 전역 무효화.
 */
export const PRICING_VER_KEY = 'pricing:ver';
export const PRICING_TTL_SECONDS = 60;
const PRICING_VER_TTL_SECONDS = 86_400;

export function pricingKey(ver: string, mode: string, centerId?: string | null): string {
  return `pricing:${ver}:${mode}:${centerId ?? 'global'}`;
}

export async function getPricingVersion(cache: CacheProvider): Promise<string> {
  return (await cache.get<string>(PRICING_VER_KEY)) ?? '0';
}

/** 요금 변경 시 호출 — 새 버전을 기록해 기존 캐시를 일괄 무효화. */
export async function bumpPricingVersion(cache: CacheProvider, stamp: number): Promise<void> {
  await cache.set(PRICING_VER_KEY, String(stamp), PRICING_VER_TTL_SECONDS);
}
