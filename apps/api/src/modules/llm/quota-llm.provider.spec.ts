import { HttpException } from '@nestjs/common';
import { MemoryCacheProvider } from '../../common/cache/memory-cache.provider';
import { UsageQuota } from '../../common/quota/usage-quota';
import { LlmPurpose } from './llm.types';
import { MockLlmProvider } from './mock-llm.provider';
import { QuotaLlmProvider } from './quota-llm.provider';

const limits = (over: Partial<Record<LlmPurpose, number>> = {}): Record<LlmPurpose, number> => ({
  report: 100, similarity: 100, ocr: 100, consulting: 100, ...over,
});
const make = (l: Partial<Record<LlmPurpose, number>>, total = 1000) =>
  new QuotaLlmProvider(new MockLlmProvider(), new UsageQuota(new MemoryCacheProvider(), 'llm'), limits(l), total);

const ocrInput = { imageBase64: 'AAAA', mimeType: 'image/png' };
const consultInput = { grade: '고3', interest: 'susi', package: 'basic', documents: [] };

describe('QuotaLlmProvider (어댑터 경계 상한)', () => {
  it('용도별 상한 초과 시 503 + AI_QUOTA_EXCEEDED 로 실패', async () => {
    const p = make({ ocr: 1 });
    await expect(p.extractScoreReport(ocrInput)).resolves.toMatchObject({ demo: true });
    await expect(p.extractScoreReport(ocrInput)).rejects.toBeInstanceOf(HttpException);
    try {
      await p.extractScoreReport(ocrInput);
    } catch (e) {
      const res = (e as HttpException).getResponse() as { error: { code: string; message: string } };
      expect((e as HttpException).getStatus()).toBe(503);
      expect(res.error.code).toBe('AI_QUOTA_EXCEEDED');
      // 운영 수치(상한·잔여)를 사용자에게 노출하지 않는다
      expect(res.error.message).not.toMatch(/\d+\s*\/\s*\d+/);
    }
  });

  it('한 용도가 막혀도 다른 용도는 계속 동작한다', async () => {
    const p = make({ ocr: 1 });
    await p.extractScoreReport(ocrInput);
    await expect(p.extractScoreReport(ocrInput)).rejects.toBeInstanceOf(HttpException);
    await expect(p.analyzeConsulting(consultInput)).resolves.toMatchObject({ model: 'mock' });
  });

  it('합산 상한이 개별 상한보다 먼저 막는다', async () => {
    const p = make({}, 2); // 개별 100, 합산 2
    await p.reviewReport({ targetType: 'booking', reason: '불친절' });
    await p.analyzeConsulting(consultInput);
    await expect(p.extractScoreReport(ocrInput)).rejects.toBeInstanceOf(HttpException);
  });

  it('상한에 걸리면 내부 provider 를 호출하지 않는다(비용 발생 없음)', async () => {
    const inner = new MockLlmProvider();
    const spy = jest.spyOn(inner, 'extractScoreReport');
    const p = new QuotaLlmProvider(inner, new UsageQuota(new MemoryCacheProvider(), 'llm'), limits({ ocr: 1 }), 1000);
    await p.extractScoreReport(ocrInput);
    expect(spy).toHaveBeenCalledTimes(1);
    await expect(p.extractScoreReport(ocrInput)).rejects.toBeInstanceOf(HttpException);
    expect(spy).toHaveBeenCalledTimes(1); // 두 번째는 도달하지 않음
  });

  it('usage() 는 용도별 사용량·상한을 증가 없이 보고한다', async () => {
    const p = make({ ocr: 5 });
    await p.extractScoreReport(ocrInput);
    const u = await p.usage();
    expect(u.byPurpose.ocr).toEqual({ used: 1, limit: 5 });
    expect(u.byPurpose.consulting.used).toBe(0);
    expect(u.total).toBe(1);
    expect((await p.usage()).byPurpose.ocr.used).toBe(1); // peek 이므로 불변
  });
});
