/**
 * Q1 SLA 집계(순수) — 타임스탬프 4점(접수 created → 클레임 claimed → 첫응답 firstReply → 해결 resolved)에서
 * 풀별(pool = scope: assigned/open) 지표를 계산. DB 수집은 서비스가, 계산·평균은 여기서(테스트 용이).
 */
export interface SlaRow {
  pool: string; // 'assigned' | 'open' 등
  createdAt: number; // ms
  claimedAt: number | null;
  firstReplyAt: number | null;
  resolvedAt: number | null;
}

export interface PoolSla {
  pool: string;
  count: number;
  resolved: number;
  resolutionRate: number; // 0~100(%)
  avgClaimMin: number | null; // 접수→클레임 평균(분)
  avgFirstReplyMin: number | null; // 접수→첫응답 평균(분)
  avgResolveMin: number | null; // 접수→해결 평균(분)
}

const avgMin = (deltas: number[]): number | null =>
  deltas.length === 0
    ? null
    : Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length / 60000);

export function computeSla(rows: SlaRow[]): PoolSla[] {
  const byPool = new Map<string, SlaRow[]>();
  for (const r of rows) {
    const arr = byPool.get(r.pool) ?? [];
    arr.push(r);
    byPool.set(r.pool, arr);
  }
  const out: PoolSla[] = [];
  for (const [pool, arr] of byPool) {
    const claim: number[] = [];
    const reply: number[] = [];
    const resolve: number[] = [];
    let resolved = 0;
    for (const r of arr) {
      if (r.claimedAt != null && r.claimedAt >= r.createdAt)
        claim.push(r.claimedAt - r.createdAt);
      if (r.firstReplyAt != null && r.firstReplyAt >= r.createdAt)
        reply.push(r.firstReplyAt - r.createdAt);
      if (r.resolvedAt != null && r.resolvedAt >= r.createdAt) {
        resolve.push(r.resolvedAt - r.createdAt);
        resolved += 1;
      }
    }
    out.push({
      pool,
      count: arr.length,
      resolved,
      resolutionRate:
        arr.length === 0 ? 0 : Math.round((resolved / arr.length) * 100),
      avgClaimMin: avgMin(claim),
      avgFirstReplyMin: avgMin(reply),
      avgResolveMin: avgMin(resolve),
    });
  }
  return out.sort((a, b) => a.pool.localeCompare(b.pool));
}
