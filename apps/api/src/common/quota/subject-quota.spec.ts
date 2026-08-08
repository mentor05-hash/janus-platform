import { MemoryCacheProvider } from '../cache/memory-cache.provider';
import {
  SubjectQuota,
  SubjectQuotaExceededError,
  kstMonth,
  secondsToKstMonthEnd,
} from './subject-quota';
import { subjectQuotaToHttp } from './subject-quota.http';

const make = (failOpen = true) =>
  new SubjectQuota(new MemoryCacheProvider(), 'llm', failOpen);

describe('SubjectQuota — 사용자별 한도(B221 1층)', () => {
  it('사용자별로 따로 센다 — 한 명이 다 써도 다른 사람은 영향 없다', async () => {
    const q = make();
    await q.consume('abuse', 'f', 'userA', 1);
    await expect(q.consume('abuse', 'f', 'userA', 1)).rejects.toBeInstanceOf(
      SubjectQuotaExceededError,
    );
    // 이게 전역 상한만 있을 때 불가능했던 것 — 공유 예산 독식 방지
    await expect(q.consume('abuse', 'f', 'userB', 1)).resolves.toBeUndefined();
  });

  it('기능별로 따로 센다', async () => {
    const q = make();
    await q.consume('abuse', 'f1', 'u', 1);
    await expect(q.consume('abuse', 'f2', 'u', 1)).resolves.toBeUndefined();
  });

  it('limit <= 0 은 무제한', async () => {
    const q = make();
    for (let i = 0; i < 50; i++) await q.consume('abuse', 'f', 'u', 0);
  });

  it('일/월 카운터는 서로 다른 버킷', async () => {
    const q = make();
    await q.consume('entitlement', 'f', 'u', 1, 'month');
    // 월 카운터를 다 썼어도 일 카운터는 비어 있다
    await expect(
      q.consume('abuse', 'f', 'u', 1, 'day'),
    ).resolves.toBeUndefined();
    await expect(
      q.consume('entitlement', 'f', 'u', 1, 'month'),
    ).rejects.toBeInstanceOf(SubjectQuotaExceededError);
  });

  it('초과 에러에 kind·period 가 실려 응답을 구분할 수 있다', async () => {
    const q = make();
    await q.consume('entitlement', 'ai_report', 'u', 1, 'month');
    try {
      await q.consume('entitlement', 'ai_report', 'u', 1, 'month');
      throw new Error('던져야 한다');
    } catch (e) {
      const err = e as SubjectQuotaExceededError;
      expect(err.kind).toBe('entitlement');
      expect(err.period).toBe('month');
    }
  });

  // 층 설계의 핵심 — 권리는 fail-open, 비용은 하류 전역 상한이 fail-closed 로 막는다.
  it('카운터 장애 시 기본은 통과 — 인프라 사정으로 유료 권리를 끊지 않는다', async () => {
    const broken = {
      incr: () => Promise.resolve(0),
      get: () => Promise.resolve(null),
    } as never;
    const q = new SubjectQuota(broken, 'llm'); // failOpen 기본 true
    await expect(
      q.consume('entitlement', 'f', 'u', 5, 'month'),
    ).resolves.toBeUndefined();
  });

  it('failOpen=false 로 두면 장애 시 차단된다(선택 가능)', async () => {
    const broken = {
      incr: () => Promise.resolve(0),
      get: () => Promise.resolve(null),
    } as never;
    const q = new SubjectQuota(broken, 'llm', false);
    await expect(
      q.consume('entitlement', 'f', 'u', 5, 'month'),
    ).rejects.toBeInstanceOf(SubjectQuotaExceededError);
  });

  // 권리(entitlement)와 남용(abuse)은 **세는 대상이 다르다** — 이 구분이 유료 몫 소실을 막는다.
  describe('check()/record() — 권리는 성공만 센다', () => {
    it('check() 는 증가시키지 않는다', async () => {
      const q = make();
      await q.check('entitlement', 'ai_report', 'u', 2, 'month');
      await q.check('entitlement', 'ai_report', 'u', 2, 'month');
      expect((await q.usage('ai_report', 'u', 2, 'month')).used).toBe(0);
    });

    // 이전 구현(선차감)은 여기서 유료 1건이 사라졌다.
    it('작업이 실패해 record() 를 안 부르면 잔여가 줄지 않는다', async () => {
      const q = make();
      await q.check('entitlement', 'ai_report', 'u', 2, 'month');
      // …작업 실패 → record() 호출 없음
      expect((await q.usage('ai_report', 'u', 2, 'month')).remaining).toBe(2);
    });

    it('record() 만큼만 차감되고, 소진되면 check() 가 거절한다', async () => {
      const q = make();
      await q.record('ai_report', 'u', 'month');
      await q.record('ai_report', 'u', 'month');
      expect((await q.usage('ai_report', 'u', 2, 'month')).used).toBe(2);
      await expect(
        q.check('entitlement', 'ai_report', 'u', 2, 'month'),
      ).rejects.toBeInstanceOf(SubjectQuotaExceededError);
    });

    it('used == limit 경계에서 거절한다 — off-by-one 없음', async () => {
      const q = make();
      await q.record('f', 'u', 'day');
      await expect(q.check('abuse', 'f', 'u', 1, 'day')).rejects.toBeInstanceOf(
        SubjectQuotaExceededError,
      );
    });

    it('limit 0(무제한)은 check() 를 통과', async () => {
      await expect(
        make().check('entitlement', 'f', 'u', 0, 'month'),
      ).resolves.toBeUndefined();
    });

    it('record() 는 캐시 장애에도 던지지 않는다 — 이미 결과를 준 뒤다', async () => {
      const broken = {
        incr: () => Promise.resolve(0),
        get: () => Promise.resolve(null),
      } as never;
      await expect(
        new SubjectQuota(broken, 'llm').record('f', 'u', 'month'),
      ).resolves.toBeUndefined();
    });

    // 반대로 남용 한도는 선증가여야 한다 — 실패를 안 세면 재시도로 우회된다.
    it('consume() 은 초과 시도까지 센다(선증가) — 우회 불가', async () => {
      const q = make();
      await q.consume('abuse', 'f', 'u', 2);
      await q.consume('abuse', 'f', 'u', 2);
      await expect(q.consume('abuse', 'f', 'u', 2)).rejects.toBeInstanceOf(
        SubjectQuotaExceededError,
      );
      expect((await q.usage('f', 'u', 2)).used).toBe(3);
    });
  });

  it('usage() 는 증가 없이 잔여를 보고한다', async () => {
    const q = make();
    await q.consume('entitlement', 'ai_report', 'u', 6, 'month');
    const u = await q.usage('ai_report', 'u', 6, 'month');
    expect(u).toEqual({ used: 1, limit: 6, remaining: 5 });
    expect((await q.usage('ai_report', 'u', 6, 'month')).used).toBe(1); // 불변
  });

  it('무제한이면 remaining 은 Infinity', async () => {
    const u = await make().usage('f', 'u', 0);
    expect(u.remaining).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('KST 월 경계', () => {
  it('kstMonth 는 KST 기준 YYYYMM', () => {
    // 2026-07-31 20:00 UTC = 2026-08-01 05:00 KST → 8월 버킷
    expect(kstMonth(new Date('2026-07-31T20:00:00Z'))).toBe('202608');
    expect(kstMonth(new Date('2026-07-31T14:00:00Z'))).toBe('202607');
  });

  it('TTL 은 월말까지 남은 시간 — 카운터가 월을 넘겨 살지 않는다', () => {
    const ttl = secondsToKstMonthEnd(new Date('2026-07-30T15:00:00Z')); // KST 7/31 00:00
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(2 * 86_400 + 120); // 이틀 남짓
  });

  it('TTL 은 항상 60초 이상 — 월 경계 직전에 0/음수가 되지 않게', () => {
    expect(
      secondsToKstMonthEnd(new Date('2026-07-31T14:59:59Z')),
    ).toBeGreaterThanOrEqual(60);
  });
});

// 예전에는 세 경우가 전부 503 이라 클라이언트가 구분할 수 없었다 — 그것이 B221 의 겉으로 드러난 증상.
describe('HTTP 변환 — 세 경계가 서로 다른 코드', () => {
  it('권리 소진 → 402 + 업그레이드 힌트', () => {
    const ex = subjectQuotaToHttp(
      new SubjectQuotaExceededError('entitlement', 'ai_report', 6, 'month'),
    );
    expect(ex.getStatus()).toBe(402);
    const body = ex.getResponse() as {
      error: { code: string; upgradable: boolean; message: string };
    };
    expect(body.error.code).toBe('ENTITLEMENT_EXHAUSTED');
    expect(body.error.upgradable).toBe(true);
    expect(body.error.message).toContain('상위 등급');
  });

  it('남용 방지 → 429, 업그레이드 유도 없음', () => {
    const ex = subjectQuotaToHttp(
      new SubjectQuotaExceededError('abuse', 'report_review', 5, 'day'),
    );
    expect(ex.getStatus()).toBe(429);
    const body = ex.getResponse() as {
      error: { code: string; upgradable: boolean };
    };
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.upgradable).toBe(false);
  });

  it('운영 수치(상한·잔여)를 사용자에게 노출하지 않는다', () => {
    for (const kind of ['entitlement', 'abuse'] as const) {
      const ex = subjectQuotaToHttp(
        new SubjectQuotaExceededError(kind, 'f', 6, 'month'),
      );
      const body = ex.getResponse() as { error: { message: string } };
      expect(body.error.message).not.toMatch(/\d+\s*\/\s*\d+/);
      expect(body.error.message).not.toContain('6');
    }
  });
});
