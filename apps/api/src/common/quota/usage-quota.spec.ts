import { CacheProvider } from '../cache/cache.types';
import { MemoryCacheProvider } from '../cache/memory-cache.provider';
import { kstDay, QuotaExceededError, UsageQuota, envInt } from './usage-quota';

/** incr 이 항상 0 을 반환하는 캐시 — Redis 장애(degrade) 상황 재현. */
class BrokenCache implements CacheProvider {
  async get<T>(): Promise<T | null> {
    return null;
  }
  async set(): Promise<void> {}
  async del(): Promise<void> {}
  async incr(): Promise<number> {
    return 0;
  }
  async acquireLock(): Promise<boolean> {
    return true;
  }
}

describe('UsageQuota (유료 API 일 호출 상한)', () => {
  it('상한까지는 통과하고 초과분부터 던진다', async () => {
    const q = new UsageQuota(new MemoryCacheProvider(), 'llm');
    await q.consume('ocr', 3);
    await q.consume('ocr', 3);
    await q.consume('ocr', 3);
    await expect(q.consume('ocr', 3)).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
  });

  it('스코프별로 따로 센다 — 한 용도가 다 써도 다른 용도는 살아있다', async () => {
    const q = new UsageQuota(new MemoryCacheProvider(), 'llm');
    await q.consume('ocr', 1);
    await expect(q.consume('ocr', 1)).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
    await expect(q.consume('consulting', 1)).resolves.toBeUndefined();
  });

  it('limit 0 이하는 무제한으로 본다(상한 미설정 의도)', async () => {
    const q = new UsageQuota(new MemoryCacheProvider(), 'llm');
    for (let i = 0; i < 50; i++) await q.consume('report', 0);
  });

  it('질문당 1회 제한 — 같은 scope 키로는 두 번째가 막힌다', async () => {
    const q = new UsageQuota(new MemoryCacheProvider(), 'llm');
    await q.consume('draft:question-abc', 1);
    await expect(q.consume('draft:question-abc', 1)).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
    // 다른 질문은 영향 없음
    await expect(q.consume('draft:question-xyz', 1)).resolves.toBeUndefined();
  });

  it('카운터 장애 시 기본은 차단(fail closed) — 사용량 초과가 아님을 구분해 알린다', async () => {
    const q = new UsageQuota(new BrokenCache(), 'llm');
    await expect(q.consume('ocr', 10)).rejects.toMatchObject({
      counterUnavailable: true,
    });
  });

  it('failOpen 설정 시 카운터 장애를 통과시킨다', async () => {
    const q = new UsageQuota(new BrokenCache(), 'media', true);
    await expect(q.consume('token', 10)).resolves.toBeUndefined();
  });

  it('peek 은 카운터를 증가시키지 않는다', async () => {
    const q = new UsageQuota(new MemoryCacheProvider(), 'llm');
    await q.consume('ocr', 5);
    expect(await q.peek('ocr')).toBe(1);
    expect(await q.peek('ocr')).toBe(1);
    expect(await q.peek('없는스코프')).toBe(0);
  });

  it('일자 경계는 KST — 카운터 키가 KST 일자로 갈린다', async () => {
    // 2026-07-26 14:30 UTC = KST 07-26 23:30 (같은 날)
    expect(kstDay(new Date('2026-07-26T14:30:00Z'))).toBe('20260726');
    // 2026-07-26 15:30 UTC = KST 07-27 00:30 (다음 날로 넘어감)
    expect(kstDay(new Date('2026-07-26T15:30:00Z'))).toBe('20260727');
  });

  it('일자가 바뀌면 카운터가 새로 시작된다', async () => {
    const cache = new MemoryCacheProvider();
    const q = new UsageQuota(cache, 'llm');
    const realNow = Date.now;
    try {
      Date.now = () => new Date('2026-07-26T10:00:00Z').getTime();
      jest.useFakeTimers().setSystemTime(new Date('2026-07-26T10:00:00Z'));
      await q.consume('ocr', 1);
      await expect(q.consume('ocr', 1)).rejects.toBeInstanceOf(
        QuotaExceededError,
      );

      // KST 로 다음 날
      jest.setSystemTime(new Date('2026-07-27T10:00:00Z'));
      await expect(q.consume('ocr', 1)).resolves.toBeUndefined();
    } finally {
      jest.useRealTimers();
      Date.now = realNow;
    }
  });
});

describe('envInt', () => {
  it('정상 정수는 그대로, 비정상·미설정은 기본값', () => {
    expect(envInt('120', 10)).toBe(120);
    expect(envInt('0', 10)).toBe(0); // 0 = 무제한 의도이므로 기본값으로 덮지 않는다
    expect(envInt(undefined, 10)).toBe(10);
    expect(envInt('abc', 10)).toBe(10);
    expect(envInt('-5', 10)).toBe(10);
  });
});
