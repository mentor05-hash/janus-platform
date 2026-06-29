import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Notification } from '../api/types';

export function NotificationsPage() {
  const [rows, setRows] = useState<Notification[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.get<Notification[]>('/notifications'));
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

  async function read(id: string) {
    try {
      await api.patch(`/notifications/${id}/read`, {});
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '처리 실패');
    }
  }

  if (loading) return <p>불러오는 중…</p>;

  return (
    <div>
      <h2 style={{ color: 'var(--teal)' }}>알림</h2>
      {error && <p className="error">{error}</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map((n) => (
          <div
            className="card"
            key={n.id}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: n.read_at ? 0.55 : 1 }}
          >
            <div>
              <strong>{n.type ?? '알림'}</strong>{' '}
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>{new Date(n.created_at).toLocaleString('ko-KR')}</span>
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>{JSON.stringify(n.payload ?? {})}</div>
            </div>
            {!n.read_at && (
              <button className="btn ghost sm" onClick={() => read(n.id)}>
                읽음
              </button>
            )}
          </div>
        ))}
        {rows.length === 0 && <p style={{ color: 'var(--muted)' }}>알림이 없습니다.</p>}
      </div>
    </div>
  );
}
