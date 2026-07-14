import { computeSla, type SlaRow } from './qna-sla';

const H = 3600000; // 1시간 ms
const t0 = 1_700_000_000_000;
const row = (pool: string, claim: number | null, reply: number | null, resolve: number | null): SlaRow => ({
  pool,
  createdAt: t0,
  claimedAt: claim == null ? null : t0 + claim,
  firstReplyAt: reply == null ? null : t0 + reply,
  resolvedAt: resolve == null ? null : t0 + resolve,
});

describe('computeSla (Q1 풀별 SLA 집계)', () => {
  it('풀별로 분리 집계', () => {
    const r = computeSla([row('assigned', H, 2 * H, 3 * H), row('open', null, null, null)]);
    expect(r.map((x) => x.pool)).toEqual(['assigned', 'open']); // 정렬
    expect(r.find((x) => x.pool === 'assigned')?.count).toBe(1);
    expect(r.find((x) => x.pool === 'open')?.count).toBe(1);
  });

  it('평균 지연(분) — 접수 기준 delta 평균', () => {
    const r = computeSla([row('open', H, 2 * H, null), row('open', 3 * H, 4 * H, null)]);
    const o = r[0];
    expect(o.avgClaimMin).toBe(120); // (1h+3h)/2 = 2h = 120분
    expect(o.avgFirstReplyMin).toBe(180); // (2h+4h)/2 = 3h
  });

  it('해결률 = resolved/count, 미해결은 avgResolve null', () => {
    const r = computeSla([row('open', H, H, 2 * H), row('open', H, H, null)]);
    expect(r[0].resolved).toBe(1);
    expect(r[0].resolutionRate).toBe(50);
    expect(r[0].avgResolveMin).toBe(120); // 해결된 1건만
  });

  it('타임스탬프 전무면 평균 null·해결률 0', () => {
    const r = computeSla([row('open', null, null, null)]);
    expect(r[0]).toMatchObject({ avgClaimMin: null, avgFirstReplyMin: null, avgResolveMin: null, resolutionRate: 0 });
  });

  it('음수 delta(시계 역전)는 제외', () => {
    const bad: SlaRow = { pool: 'open', createdAt: t0, claimedAt: t0 - H, firstReplyAt: null, resolvedAt: null };
    expect(computeSla([bad])[0].avgClaimMin).toBeNull();
  });
});
