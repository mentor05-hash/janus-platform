import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { HrStudent } from '../api/types';

export function HrStudentsPage() {
  const [rows, setRows] = useState<HrStudent[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.get<HrStudent[]>('/hr/students'));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(id: string) {
    try {
      await api.post(`/hr/students/${id}/approve`, {});
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '승인 실패');
    }
  }

  if (loading) return <p>불러오는 중…</p>;

  return (
    <div>
      <h2 style={{ color: 'var(--teal)' }}>학생 등록 승인</h2>
      {error && <p className="error">{error}</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map((s) => (
          <div className="card" key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <strong>{s.name}</strong> <span style={{ color: 'var(--muted)' }}>({s.login_id})</span>{' '}
              <span className={`chip ${s.status === 'approved' ? 'done' : 'confirmed'}`}>{s.status}</span>
            </div>
            {s.status !== 'approved' && (
              <button className="btn sm" onClick={() => approve(s.id)}>
                승인
              </button>
            )}
          </div>
        ))}
        {rows.length === 0 && <p style={{ color: 'var(--muted)' }}>학생이 없습니다.</p>}
      </div>
    </div>
  );
}
