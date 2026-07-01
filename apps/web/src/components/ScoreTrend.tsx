import { Badge, EmptyState } from './ui';

export type Placement = { tier?: string; line?: string; universities?: string[]; departments?: string[]; source?: string; memo?: string; avg?: number } | null;
export type TrendPoint = { period: string; examType: string | null; avg: number | null; subjects: { subject: string; score: number | null }[]; placement: Placement };
export type Trend = { student: { name?: string; loginId?: string }; points: TrendPoint[] };

export const TIER_KIND: Record<string, 'done' | 'confirmed' | 'new' | 'soft'> = { 최상위: 'done', 상위: 'done', 중상위: 'confirmed', 중위: 'new', 중하위: 'soft', 기초: 'soft' };

/** 성적 추이(평균) 선그래프 + 배치(대학·학과 라인) 변화 레인. showPlacement=false 면 배치 숨김. */
export function ScoreTrend({ trend, showPlacement = true }: { trend: Trend; showPlacement?: boolean }) {
  const pts = trend.points;
  if (!pts.length) return <EmptyState>성적 기록이 없어요.</EmptyState>;
  const W = Math.max(360, pts.length * 150), H = 180, PAD = 34;
  const xs = (i: number) => PAD + (pts.length === 1 ? (W - 2 * PAD) / 2 : (i * (W - 2 * PAD)) / (pts.length - 1));
  const ys = (v: number) => H - PAD - ((v - 40) / 60) * (H - 2 * PAD);
  const line = pts.map((p, i) => `${xs(i)},${ys(p.avg ?? 40)}`).join(' ');
  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <svg width={W} height={H} style={{ display: 'block' }}>
          {[40, 60, 80, 100].map((g) => (
            <g key={g}><line x1={PAD} x2={W - PAD} y1={ys(g)} y2={ys(g)} stroke="var(--line)" /><text x={4} y={ys(g) + 4} fontSize="10" fill="var(--caption)">{g}</text></g>
          ))}
          <polyline points={line} fill="none" stroke="var(--teal)" strokeWidth={2.5} />
          {pts.map((p, i) => (
            <g key={i}>
              <circle cx={xs(i)} cy={ys(p.avg ?? 40)} r={5} fill="var(--teal)" />
              <text x={xs(i)} y={ys(p.avg ?? 40) - 10} fontSize="12" fontWeight="700" fill="var(--ink)" textAnchor="middle">{p.avg ?? '-'}</text>
              <text x={xs(i)} y={H - 10} fontSize="10" fill="var(--muted)" textAnchor="middle">{p.examType ?? p.period.slice(-4)}</text>
            </g>
          ))}
        </svg>
      </div>
      {showPlacement && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          {pts.map((p, i) => (
            <div key={i} style={{ flex: '1 1 200px', minWidth: 180, border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{p.period}</div>
              {p.placement ? (
                <>
                  <Badge kind={TIER_KIND[p.placement.tier ?? ''] ?? 'soft'}>{p.placement.tier ?? '-'}</Badge>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', margin: '6px 0 2px' }}>{p.placement.line}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{(p.placement.universities ?? []).join(' · ')}</div>
                  <div style={{ fontSize: 12, color: 'var(--caption)' }}>{(p.placement.departments ?? []).join(' · ')}</div>
                  {p.placement.source === 'demo' && <div style={{ fontSize: 10, color: 'var(--caption)', marginTop: 4 }}>※ 데모 추정</div>}
                </>
              ) : <div style={{ fontSize: 12, color: 'var(--caption)' }}>배치 결과 없음</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
