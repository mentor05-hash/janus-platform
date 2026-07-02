import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Notification } from '../api/types';
import { PageHeader, Card, ErrorText, Spinner, EmptyState } from '../components/ui';

export function StudentNotificationsPage() {
  const [rows, setRows] = useState<Notification[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get<Notification[]>('/notifications').then((r) => setRows(Array.isArray(r) ? r : [])).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, []);
  return (
    <div>
      <PageHeader title="알림" sub="예약·상담·크레딧 관련 알림입니다." />
      {error && <ErrorText>{error}</ErrorText>}
      {rows === null ? <Spinner /> : rows.length === 0 ? <Card><EmptyState>알림이 없어요.</EmptyState></Card> : (
        <Card>
          {rows.map((n) => (
            <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ fontSize: 14, color: n.read_at ? 'var(--muted)' : 'var(--ink)' }}>
                {!n.read_at && <span style={{ color: 'var(--teal)' }}>● </span>}
                <b>{n.title ?? n.type ?? '알림'}</b>
                {n.body ? ` · ${n.body}` : ''}
              </span>
              <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{new Date(n.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
