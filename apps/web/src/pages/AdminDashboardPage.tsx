import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import type { Dashboard } from '../api/types';
import { PageHeader, Spinner, ErrorText } from '../components/ui';
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
        <StatCard label="총 예약" value={d.totalBookings} />
        <StatCard label="완료 상담" value={d.doneTotal} />
        <StatCard label="예정(확정)" value={d.confirmedUpcoming} />
        <StatCard label="주간 상담" value={d.weeklyConsult} />
        <StatCard label="매칭률" value={d.matchRate} unit="%" />
      </StatGrid>
    </div>
  );
}
