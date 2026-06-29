import { MemoryCacheProvider } from '../../common/cache/memory-cache.provider';
import { bumpPricingVersion, getPricingVersion, pricingKey } from './pricing-cache';

describe('요금 캐시 버전 무효화(§10)', () => {
  it('pricingKey 포맷(centerId 없으면 global)', () => {
    expect(pricingKey('7', 'zoom', null)).toBe('pricing:7:zoom:global');
    expect(pricingKey('7', 'zoom', 'c1')).toBe('pricing:7:zoom:c1');
  });

  it('기본 버전 0, bump 후 키가 달라져 이전 캐시 무효', async () => {
    const cache = new MemoryCacheProvider();
    const v0 = await getPricingVersion(cache);
    expect(v0).toBe('0');
    const key0 = pricingKey(v0, 'zoom', null);
    await cache.set(key0, { per_hour: 40000 }, 60);

    await bumpPricingVersion(cache, 12345);
    const v1 = await getPricingVersion(cache);
    expect(v1).toBe('12345');
    // 새 버전 키에는 캐시 없음 → 미스(DB 재조회 유도)
    expect(await cache.get(pricingKey(v1, 'zoom', null))).toBeNull();
  });
});
