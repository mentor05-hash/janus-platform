import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import type { Dashboard } from '../api/types';
import { PageHeader, Spinner, ErrorText, Card } from '../components/ui';
import { StatCard, StatGrid } from '../components/dashboard/widgets';

export function AdminDashboardPage() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [meta, setMeta] = useState<{ generatedAt: string; scope: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // 대시보드는 {data, meta} 모두 필요 → raw fetch 로 메타까지 수신
    fetch('/api/v1/admin/dashboard', { headers: { Authorization: `Bearer ${localStorage.getItem('mp_access')}` } })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) throw new ApiError(j.error.code, j.error.message, 0);
        setD(j.data);
        setMeta(j.meta);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, []);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!d) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="운영 대시보드"
        sub={
          meta
            ? `범위: ${meta.scope === 'global' ? '전체' : '자기 센터'} · 생성 ${new Date(meta.generatedAt).toLocaleString('ko-KR')}`
            : undefined
        }
      />
      <StatGrid>
        <StatCard label="활성 사용자" value={d.activeUsers} />
        <StatCard label="매칭 성사율" value={d.matchRate} unit="%" />
        <StatCard label="평균 만족도" value={d.avgSatisfaction != null ? `★ ${d.avgSatisfaction}` : '—'} />
        <StatCard label="주간 상담" value={d.weeklyConsult} />
        <StatCard label="완료 상담" value={d.doneTotal} />
        <StatCard label="예정(확정)" value={d.confirmedUpcoming} />
      </StatGrid>

      {d.gradeDistribution && (d.teacherCount ?? 0) > 0 && (
        <Card title={`선생님 등급 분포 (총 ${d.teacherCount}명)`} style={{ marginTop: 16, maxWidth: 620 }}>
          {(() => {
            const total = d.teacherCount || 1;
            const seg = [
              { g: 'S', n: d.gradeDistribution!.S ?? 0, c: '#CF9A3A' },
              { g: 'A', n: d.gradeDistribution!.A ?? 0, c: '#2F6FB3' },
              { g: 'B', n: d.gradeDistribution!.B ?? 0, c: '#8496AB' },
            ];
            return (
              <>
                <div style={{ display: 'flex', height: 18, borderRadius: 9, overflow: 'hidden' }}>
                  {seg.map((s) => s.n > 0 && <div key={s.g} style={{ width: `${(s.n / total) * 100}%`, background: s.c }} />)}
                </div>
                <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12.5, color: 'var(--muted)', flexWrap: 'wrap' }}>
                  {seg.map((s) => (
                    <span key={s.g} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: s.c }} />{s.g} {s.n}명 · {Math.round((s.n / total) * 100)}%
                    </span>
                  ))}
                </div>
              </>
            );
          })()}
        </Card>
      )}

      {d.trend && d.trend.length > 0 && (
        <Card title="주별 매칭 추이 (신청 vs 성사, 최근 6주)" style={{ marginTop: 16, maxWidth: 620 }}>
          {(() => {
            const max = Math.max(1, ...d.trend!.flatMap((t) => [t.applied, t.matched]));
            return (
              <>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 110 }}>
                  {d.trend!.map((t, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', gap: 3, alignItems: 'flex-end', height: '100%' }}>
                      <div title={`신청 ${t.applied}`} style={{ flex: 1, background: '#C6D1E0', height: `${(t.applied / max) * 100}%`, borderRadius: '4px 4px 0 0', minHeight: 2 }} />
                      <div title={`성사 ${t.matched}`} style={{ flex: 1, background: 'var(--teal)', height: `${(t.matched / max) * 100}%`, borderRadius: '4px 4px 0 0', minHeight: 2 }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                  {d.trend!.map((t, i) => <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--muted)' }}>{t.weeksAgo === 0 ? '이번주' : `${t.weeksAgo}주전`}</div>)}
                </div>
                <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                  <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#C6D1E0', verticalAlign: 'middle', marginRight: 4 }} />신청</span>
                  <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--teal)', verticalAlign: 'middle', marginRight: 4 }} />성사</span>
                </div>
              </>
            );
          })()}
        </Card>
      )}

      {d.gradePayTable && d.gradePayTable.length > 0 && (
        <Card title="등급별 급여·수당표" style={{ marginTop: 16, maxWidth: 620 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}><th style={pth}>등급</th><th style={pth}>건당</th><th style={pth}>시급</th><th style={pth}>등급 수당</th></tr></thead>
            <tbody>
              {d.gradePayTable!.map((g) => (
                <tr key={g.grade} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={ptd}><b>{g.grade}</b></td>
                  <td style={ptd}>{g.perCaseRate.toLocaleString()}원</td>
                  <td style={ptd}>{g.hourlyRate.toLocaleString()}원</td>
                  <td style={ptd}>{g.gradeAllowance.toLocaleString()}원</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

const pth: React.CSSProperties = { padding: '8px 10px', fontSize: 11, fontWeight: 700 };
const ptd: React.CSSProperties = { padding: '8px 10px', fontVariantNumeric: 'tabular-nums' };
