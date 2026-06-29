import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Booking } from '../api/types';

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '미정';

export function TeacherBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBookings(await api.get<Booking[]>('/bookings?role=teacher'));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: string) {
    try {
      await api.patch(`/bookings/${id}/${action}`, {});
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '처리 실패');
    }
  }

  if (loading) return <p>불러오는 중…</p>;

  return (
    <div>
      <h2 style={{ color: 'var(--teal)' }}>내 예약</h2>
      {error && <p className="error">{error}</p>}
      {bookings.length === 0 && <p style={{ color: 'var(--muted)' }}>예약이 없습니다.</p>}
      <div style={{ display: 'grid', gap: 12 }}>
        {bookings.map((b) => (
          <div className="card" key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600 }}>
                {b.consultType ?? '-'} · {b.mode} <span className={`chip ${b.status}`}>{b.status}</span>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                {fmt(b.start)} ~ {fmt(b.end)} · {b.chargedCredits.toLocaleString()}크레딧
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {b.status === 'new' && (
                <>
                  <button className="btn sm" onClick={() => act(b.id, 'accept')}>
                    수락
                  </button>
                  <button className="btn ghost sm" onClick={() => act(b.id, 'reject')}>
                    거절
                  </button>
                </>
              )}
              {b.status === 'confirmed' && (
                <>
                  <button className="btn sm" onClick={() => act(b.id, 'complete')}>
                    완료
                  </button>
                  <button className="btn ghost sm" onClick={() => act(b.id, 'noshow')}>
                    노쇼
                  </button>
                </>
              )}
              {(b.status === 'confirmed' || b.status === 'done') && (
                <Link className="btn ghost sm" to={`/app/bookings/${b.id}/note`}>
                  상담기록
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
