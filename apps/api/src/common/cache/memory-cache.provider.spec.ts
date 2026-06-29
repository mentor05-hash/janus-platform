import { MemoryCacheProvider } from './memory-cache.provider';

describe('MemoryCacheProvider (§10)', () => {
  it('set → get 반환', async () => {
    const c = new MemoryCacheProvider();
    await c.set('k', { a: 1 }, 60);
    expect(await c.get<{ a: number }>('k')).toEqual({ a: 1 });
  });

  it('TTL 0 은 즉시 만료', async () => {
    const c = new MemoryCacheProvider();
    await c.set('k', 'v', 0);
    expect(await c.get('k')).toBeNull();
  });

  it('del 후 null', async () => {
    const c = new MemoryCacheProvider();
    await c.set('k', 'v', 60);
    await c.del('k');
    expect(await c.get('k')).toBeNull();
  });

  it('미존재 키는 null', async () => {
    const c = new MemoryCacheProvider();
    expect(await c.get('none')).toBeNull();
  });

  it('incr 은 윈도우 내 누적, 만료 후 리셋', async () => {
    const c = new MemoryCacheProvider();
    expect(await c.incr('rl', 60)).toBe(1);
    expect(await c.incr('rl', 60)).toBe(2);
    expect(await c.incr('rl', 60)).toBe(3);
    expect(await c.incr('rl2', 0)).toBe(1); // 즉시 만료 → 매번 1
    expect(await c.incr('rl2', 0)).toBe(1);
  });
});
