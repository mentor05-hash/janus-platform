import { HttpException } from '@nestjs/common';
import { MemoryCacheProvider } from '../../common/cache/memory-cache.provider';
import { UsageQuota } from '../../common/quota/usage-quota';
import { billedMinutes, QuotaSttProvider } from './quota-stt.provider';
import type { SttInput, SttProvider, SttResult } from './stt.types';

class CountingStt implements SttProvider {
  calls = 0;
  transcribe(input: SttInput): Promise<SttResult> {
    this.calls++;
    return Promise.resolve({
      text: `len=${input.audio.byteLength}`,
      engine: 'fake',
      lang: 'ko',
    });
  }
}

const audio = (bytes: number) => Buffer.alloc(bytes);
const quota = () => new UsageQuota(new MemoryCacheProvider(), 'stt', true);

describe('QuotaSttProvider — 분 단위 상한', () => {
  it('과금 분은 올림이고 최소 1분이다', () => {
    expect(billedMinutes({ audio: audio(1), durationSec: 1 })).toBe(1);
    expect(billedMinutes({ audio: audio(1), durationSec: 60 })).toBe(1);
    expect(billedMinutes({ audio: audio(1), durationSec: 61 })).toBe(2);
    expect(billedMinutes({ audio: audio(1), durationSec: 1800 })).toBe(30);
  });

  it('durationSec 이 없으면 바이트로 추정한다 — 32kbps 가정', () => {
    // 32kbps = 4,000 B/s → 240,000 B ≈ 60초 ≈ 1분
    expect(billedMinutes({ audio: audio(240_000) })).toBe(1);
    expect(billedMinutes({ audio: audio(240_001) })).toBe(2);
    // durationSec 이 0·null 이면 '모름' 으로 보고 추정으로 넘어간다(0분 아님).
    expect(billedMinutes({ audio: audio(240_001), durationSec: 0 })).toBe(2);
    expect(billedMinutes({ audio: audio(240_001), durationSec: null })).toBe(2);
  });

  it('호출 수는 남았어도 분을 다 쓰면 막힌다 — 길이 비례 과금의 핵심', async () => {
    const inner = new CountingStt();
    // 호출 100건은 넉넉하지만 분은 50 뿐이다.
    const p = new QuotaSttProvider(inner, quota(), 100, 50);
    await p.transcribe({ audio: audio(1), durationSec: 1800 }); // 30분
    expect(inner.calls).toBe(1);
    // 다음 30분은 누적 60 > 50 이라 거부된다(호출은 2번째일 뿐).
    await expect(
      p.transcribe({ audio: audio(1), durationSec: 1800 }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(inner.calls).toBe(1); // 내부 유료 호출까지 가지 않았다
  });

  it('분이 남았어도 호출 수를 다 쓰면 막힌다 — 두 축이 함께 산다', async () => {
    const inner = new CountingStt();
    const p = new QuotaSttProvider(inner, quota(), 1, 10_000);
    await p.transcribe({ audio: audio(1), durationSec: 60 });
    await expect(
      p.transcribe({ audio: audio(1), durationSec: 60 }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(inner.calls).toBe(1);
  });

  it('분 상한 0 은 무제한 — 기존 동작(호출 수 상한만)과 같다', async () => {
    const inner = new CountingStt();
    const p = new QuotaSttProvider(inner, quota(), 5, 0);
    for (let i = 0; i < 5; i++)
      await p.transcribe({ audio: audio(1), durationSec: 36_000 }); // 600분씩
    expect(inner.calls).toBe(5);
  });

  it('상한 초과는 STT_QUOTA_EXCEEDED / 503 으로 나간다', async () => {
    const p = new QuotaSttProvider(new CountingStt(), quota(), 100, 1);
    await p.transcribe({ audio: audio(1), durationSec: 60 });
    await p
      .transcribe({ audio: audio(1), durationSec: 60 })
      .then(() => {
        throw new Error('막혔어야 한다');
      })
      .catch((e: unknown) => {
        expect(e).toBeInstanceOf(HttpException);
        const res = (e as HttpException).getResponse() as {
          error: { code: string };
        };
        expect(res.error.code).toBe('STT_QUOTA_EXCEEDED');
        expect((e as HttpException).getStatus()).toBe(503);
      });
  });
});
