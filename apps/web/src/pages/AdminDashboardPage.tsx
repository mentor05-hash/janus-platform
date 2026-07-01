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
    fetch('/api/v1/admin/dashboard', { headers: { Authorization: `Bearer ${localStorage.getItem('itall_access')}` } })
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
              { g: 'S', n: d.gradeDistribution!.S ?? 0, c: '#C99A2E' },
              { g: 'A', n: d.gradeDistribution!.A ?? 0, c: '#0E5C7C' },
              { g: 'B', n: d.gradeDistribution!.B ?? 0, c: '#64748B' },
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
    </div>
  );
}
