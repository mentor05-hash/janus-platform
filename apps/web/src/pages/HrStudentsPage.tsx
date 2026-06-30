import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { HrStudent } from '../api/types';
import { PageHeader, Card, Button, Badge, Spinner, ErrorText, EmptyState } from '../components/ui';

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

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="학생 등록 승인" />
      <ErrorText>{error}</ErrorText>
      {rows.length === 0 ? (
        <EmptyState>학생이 없습니다.</EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((s) => (
            <Card key={s.id}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <strong>{s.name}</strong> <span style={{ color: 'var(--muted)' }}>({s.login_id})</span>{' '}
                  <Badge kind={s.status === 'approved' ? 'done' : 'confirmed'}>
                    {s.status === 'approved' ? '승인됨' : '대기'}
                  </Badge>
                </div>
                {s.status !== 'approved' && (
                  <Button size="sm" onClick={() => approve(s.id)}>
                    승인
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
