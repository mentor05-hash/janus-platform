import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { BlockedTime, Room, ZoomPolicy } from '../api/types';
import { PageHeader, Card, Button, Badge, ErrorText, EmptyState } from '../components/ui';

export function AdminInfraPage() {
  const [zoom, setZoom] = useState<number>(6);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [blocked, setBlocked] = useState<BlockedTime[]>([]);
  const [roomForm, setRoomForm] = useState({ type: '', capacity: 1 });
  const [blockForm, setBlockForm] = useState({ type: '', startAt: '', endAt: '', scope: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setZoom((await api.get<ZoomPolicy>('/admin/zoom-policy')).concurrent_limit);
      setRooms(await api.get<Room[]>('/admin/rooms'));
      setBlocked(await api.get<BlockedTime[]>('/admin/blocked-times'));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg('');
    setError('');
    try {
      await fn();
      setMsg(ok);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '실패');
    }
  };

  return (
    <div>
      <PageHeader title="줌 · 상담실 · 차단" />
      <ErrorText>{error}</ErrorText>
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}

      <Card title="줌 동시 한도" style={{ marginBottom: 16 }}>
        <input className="input" style={{ width: 100 }} type="number" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        <Button size="sm" style={{ marginLeft: 8 }} onClick={() => run(() => api.put('/admin/zoom-policy', { concurrentLimit: zoom }), '줌 한도 저장됨')}>
          저장
        </Button>
      </Card>

      <Card title="상담실" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div>
            <label className="label">유형</label>
            <input className="input" style={{ width: 120 }} value={roomForm.type} onChange={(e) => setRoomForm((p) => ({ ...p, type: e.target.value }))} />
          </div>
          <div>
            <label className="label">정원</label>
            <input className="input" style={{ width: 80 }} type="number" value={roomForm.capacity} onChange={(e) => setRoomForm((p) => ({ ...p, capacity: Number(e.target.value) }))} />
          </div>
          <Button size="sm" onClick={() => run(() => api.post('/admin/rooms', roomForm), '상담실 추가됨')}>추가</Button>
        </div>
        <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
          {rooms.length === 0 && <EmptyState>상담실이 없습니다.</EmptyState>}
          {rooms.map((r) => (
            <div key={r.id} style={{ fontSize: 13, color: 'var(--muted)' }}>
              {r.type ?? '-'} · 정원 {r.capacity} · <Badge kind="soft">{r.status}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card title="차단 시간(슬롯에 즉시 반영)">
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label className="label">유형</label>
            <input className="input" style={{ width: 120 }} value={blockForm.type} onChange={(e) => setBlockForm((p) => ({ ...p, type: e.target.value }))} />
          </div>
          <div>
            <label className="label">시작</label>
            <input className="input" style={{ width: 200 }} type="datetime-local" value={blockForm.startAt} onChange={(e) => setBlockForm((p) => ({ ...p, startAt: e.target.value }))} />
          </div>
          <div>
            <label className="label">종료</label>
            <input className="input" style={{ width: 200 }} type="datetime-local" value={blockForm.endAt} onChange={(e) => setBlockForm((p) => ({ ...p, endAt: e.target.value }))} />
          </div>
          <Button
            size="sm"
            disabled={!blockForm.startAt || !blockForm.endAt}
            onClick={() =>
              run(
                () =>
                  api.post('/admin/blocked-times', {
                    type: blockForm.type || undefined,
                    startAt: new Date(blockForm.startAt).toISOString(),
                    endAt: new Date(blockForm.endAt).toISOString(),
                    scope: blockForm.scope || undefined,
                  }),
                '차단 추가됨',
              )
            }
          >
            추가
          </Button>
        </div>
        <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
          {blocked.length === 0 && <EmptyState>차단 시간이 없습니다.</EmptyState>}
          {blocked.map((b) => (
            <div key={b.id} style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>
                {b.type ?? '-'} · {new Date(b.start_at).toLocaleString('ko-KR')} ~ {new Date(b.end_at).toLocaleString('ko-KR')}
              </span>
              <Button size="sm" variant="ghost" onClick={() => run(() => api.del(`/admin/blocked-times/${b.id}`), '차단 삭제됨')}>
                삭제
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
