import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Booking } from '../api/types';
import { PageHeader, Card, Button, Badge, Spinner, ErrorText, EmptyState } from '../components/ui';

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '미정';

const STATUS_LABEL: Record<string, string> = {
  new: '신규',
  confirmed: '예약됨',
  done: '완료',
  cancelled: '취소',
  rejected: '거절',
  noshow: '노쇼',
};

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

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="내 예약" sub="수락·완료 처리와 상담기록" />
      <ErrorText>{error}</ErrorText>
      {bookings.length === 0 ? (
        <EmptyState>예약이 없습니다.</EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {bookings.map((b) => (
            <Card key={b.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {b.consultType ?? '-'} · {b.mode}{' '}
                    <Badge kind={(b.status as 'confirmed') ?? 'new'}>{STATUS_LABEL[b.status] ?? b.status}</Badge>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                    {fmt(b.start)} ~ {fmt(b.end)} · {b.chargedCredits.toLocaleString()}크레딧
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {b.status === 'new' && (
                    <>
                      <Button size="sm" onClick={() => act(b.id, 'accept')}>수락</Button>
                      <Button size="sm" variant="ghost" onClick={() => act(b.id, 'reject')}>거절</Button>
                    </>
                  )}
                  {b.status === 'confirmed' && (
                    <>
                      <Button size="sm" onClick={() => act(b.id, 'complete')}>완료</Button>
                      <Button size="sm" variant="ghost" onClick={() => act(b.id, 'noshow')}>노쇼</Button>
                    </>
                  )}
                  {(b.status === 'confirmed' || b.status === 'done') && (
                    <Link className="btn ghost sm" to={`/app/bookings/${b.id}/note`}>
                      상담기록
                    </Link>
                  )}
                  <Link className="btn ghost sm" to={`/app/students/${b.studentId}/notes`}>
                    학생 이력
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
