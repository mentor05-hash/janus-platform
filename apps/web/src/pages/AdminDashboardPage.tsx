import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import type { Dashboard } from '../api/types';

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 140 }}>
      <div style={{ color: 'var(--muted)', fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--teal)' }}>{value}</div>
    </div>
  );
}

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

  if (error) return <p className="error">{error}</p>;
  if (!d) return <p>불러오는 중…</p>;

  return (
    <div>
      <h2 style={{ color: 'var(--teal)' }}>운영 대시보드</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <Metric label="활성 사용자" value={d.activeUsers} />
        <Metric label="총 예약" value={d.totalBookings} />
        <Metric label="완료 상담" value={d.doneTotal} />
        <Metric label="예정(확정)" value={d.confirmedUpcoming} />
        <Metric label="주간 상담" value={d.weeklyConsult} />
        <Metric label="매칭률(%)" value={d.matchRate} />
      </div>
      {meta && (
        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>
          범위: {meta.scope} · 생성: {new Date(meta.generatedAt).toLocaleString('ko-KR')}
        </p>
      )}
    </div>
  );
}
