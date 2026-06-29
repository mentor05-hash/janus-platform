import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Report } from '../api/types';

export function AdminReportsPage() {
  const [rows, setRows] = useState<Report[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.get<Report[]>('/reports'));
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

  async function handle(id: string, status: string) {
    const action = window.prompt('처리 메모(선택):') ?? undefined;
    try {
      await api.patch(`/reports/${id}`, { status, action });
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '처리 실패');
    }
  }

  if (loading) return <p>불러오는 중…</p>;

  return (
    <div>
      <h2 style={{ color: 'var(--teal)' }}>신고 처리</h2>
      {error && <p className="error">{error}</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map((r) => (
          <div className="card" key={r.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{r.target_type}</strong>{' '}
                <span className={`chip ${r.status === 'resolved' ? 'done' : r.status === 'dismissed' ? 'cancelled' : 'confirmed'}`}>
                  {r.status}
                </span>
                {r.ai_review?.flagged && <span className="chip noshow" style={{ marginLeft: 6 }}>AI 위반소지</span>}
              </div>
              {(r.status === 'received' || r.status === 'reviewing') && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {r.status === 'received' && (
                    <button className="btn ghost sm" onClick={() => handle(r.id, 'reviewing')}>
                      검토
                    </button>
                  )}
                  <button className="btn sm" onClick={() => handle(r.id, 'resolved')}>
                    조치완료
                  </button>
                  <button className="btn ghost sm" onClick={() => handle(r.id, 'dismissed')}>
                    기각
                  </button>
                </div>
              )}
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6 }}>
              사유: {r.reason} {r.ai_review?.summary && <span>· AI: {r.ai_review.summary}</span>}
              {r.action && <span> · 조치: {r.action}</span>}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p style={{ color: 'var(--muted)' }}>신고가 없습니다.</p>}
      </div>
    </div>
  );
}
