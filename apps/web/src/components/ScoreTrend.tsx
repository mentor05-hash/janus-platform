import { Badge, EmptyState } from './ui';

export type Placement = { tier?: string; line?: string; universities?: string[]; departments?: string[]; source?: string; memo?: string; avg?: number } | null;
export type TrendPoint = { period: string; examType: string | null; avg: number | null; subjects: { subject: string; score: number | null }[]; placement: Placement };
export type Trend = { student: { name?: string; loginId?: string }; points: TrendPoint[]; goal?: { tier?: string | null; avg?: number | null } };

export const TIER_KIND: Record<string, 'done' | 'confirmed' | 'new' | 'soft'> = { 최상위: 'done', 상위: 'done', 중상위: 'confirmed', 중위: 'new', 중하위: 'soft', 기초: 'soft' };

/** 성적 추이(평균) 선그래프 + 과목별 표 + 배치(대학·학과 라인) 변화 레인. */
export function ScoreTrend({ trend, showPlacement = true }: { trend: Trend; showPlacement?: boolean }) {
  const pts = trend.points;
  if (!pts.length) return <EmptyState>성적 기록이 없어요.</EmptyState>;
  const W = Math.max(360, pts.length * 150), H = 180, PAD = 34;
  const xs = (i: number) => PAD + (pts.length === 1 ? (W - 2 * PAD) / 2 : (i * (W - 2 * PAD)) / (pts.length - 1));
  const ys = (v: number) => H - PAD - ((v - 40) / 60) * (H - 2 * PAD);
  const line = pts.map((p, i) => `${xs(i)},${ys(p.avg ?? 40)}`).join(' ');
  const goalAvg = trend.goal?.avg ?? null;
  const lastAvg = pts[pts.length - 1]?.avg ?? null;
  const subjects = Array.from(new Set(pts.flatMap((p) => p.subjects.map((s) => s.subject))));
  const scoreAt = (pt: TrendPoint, subj: string) => pt.subjects.find((s) => s.subject === subj)?.score ?? null;
  const td: React.CSSProperties = { padding: '6px 10px', fontSize: 12, borderTop: '1px solid var(--line)', textAlign: 'center' };
  return (
    <div>
      {(goalAvg != null || trend.goal?.tier) && (
        <div style={{ fontSize: 13, marginBottom: 8, color: 'var(--muted)' }}>
          🎯 목표 {trend.goal?.tier ?? ''}{goalAvg != null ? ` · 평균 ${goalAvg}` : ''}
          {goalAvg != null && lastAvg != null && <span style={{ fontWeight: 700, color: lastAvg >= goalAvg ? 'var(--chip-done)' : 'var(--chip-confirmed)' }}> · {lastAvg >= goalAvg ? '목표 달성' : `목표까지 +${Math.round((goalAvg - lastAvg) * 10) / 10}`}</span>}
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <svg width={W} height={H} style={{ display: 'block' }}>
          {[40, 60, 80, 100].map((g) => (
            <g key={g}><line x1={PAD} x2={W - PAD} y1={ys(g)} y2={ys(g)} stroke="var(--line)" /><text x={4} y={ys(g) + 4} fontSize="10" fill="var(--caption)">{g}</text></g>
          ))}
          {goalAvg != null && <line x1={PAD} x2={W - PAD} y1={ys(goalAvg)} y2={ys(goalAvg)} stroke="var(--chip-confirmed)" strokeDasharray="4 3" />}
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
      {/* 과목별 추이 */}
      {subjects.length > 0 && pts.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
          <thead><tr>
            <th style={{ ...td, textAlign: 'left', color: 'var(--muted)', fontWeight: 700, borderTop: 'none' }}>과목</th>
            {pts.map((p, i) => <th key={i} style={{ ...td, color: 'var(--muted)', fontWeight: 700, borderTop: 'none' }}>{p.examType ?? p.period.slice(-4)}</th>)}
            <th style={{ ...td, color: 'var(--muted)', fontWeight: 700, borderTop: 'none' }}>변화</th>
          </tr></thead>
          <tbody>
            {subjects.map((subj) => {
              const first = scoreAt(pts[0], subj), last = scoreAt(pts[pts.length - 1], subj);
              const delta = first != null && last != null ? Math.round((last - first) * 10) / 10 : null;
              return (
                <tr key={subj}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{subj}</td>
                  {pts.map((p, i) => <td key={i} style={td}>{scoreAt(p, subj) ?? '-'}</td>)}
                  <td style={{ ...td, fontWeight: 700, color: delta == null ? 'var(--caption)' : delta > 0 ? 'var(--chip-done)' : delta < 0 ? 'var(--chip-danger)' : 'var(--muted)' }}>
                    {delta == null ? '-' : delta > 0 ? `▲${delta}` : delta < 0 ? `▼${Math.abs(delta)}` : '─'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
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
