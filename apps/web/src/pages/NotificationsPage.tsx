import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Notification } from '../api/types';
import { PageHeader, Card, Button, Spinner, ErrorText, EmptyState } from '../components/ui';

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

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="알림" />
      <ErrorText>{error}</ErrorText>
      {rows.length === 0 ? (
        <EmptyState>알림이 없습니다.</EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((n) => (
            <Card key={n.id} style={{ opacity: n.read_at ? 0.55 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{n.title ?? n.type ?? '알림'}</strong>{' '}
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>{new Date(n.created_at).toLocaleString('ko-KR')}</span>
                  {n.body && <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>{n.body}</div>}
                </div>
                {!n.read_at && (
                  <Button size="sm" variant="ghost" onClick={() => read(n.id)}>
                    읽음
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
