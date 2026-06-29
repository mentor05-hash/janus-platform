import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { BlockedTime, Room, ZoomPolicy } from '../api/types';

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
    <div style={{ display: 'grid', gap: 20 }}>
      <h2 style={{ color: 'var(--teal)' }}>줌 · 상담실 · 차단</h2>
      {error && <p className="error">{error}</p>}
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}

      <section className="card">
        <h3 style={{ marginTop: 0 }}>줌 동시 한도</h3>
        <input className="input" style={{ width: 100 }} type="number" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => run(() => api.put('/admin/zoom-policy', { concurrentLimit: zoom }), '줌 한도 저장됨')}>
          저장
        </button>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>상담실</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div>
            <label className="label">유형</label>
            <input className="input" style={{ width: 120 }} value={roomForm.type} onChange={(e) => setRoomForm((p) => ({ ...p, type: e.target.value }))} />
          </div>
          <div>
            <label className="label">정원</label>
            <input className="input" style={{ width: 80 }} type="number" value={roomForm.capacity} onChange={(e) => setRoomForm((p) => ({ ...p, capacity: Number(e.target.value) }))} />
          </div>
          <button className="btn sm" onClick={() => run(() => api.post('/admin/rooms', roomForm), '상담실 추가됨')}>
            추가
          </button>
        </div>
        <ul style={{ color: 'var(--muted)', fontSize: 13 }}>
          {rooms.map((r) => (
            <li key={r.id}>
              {r.type ?? '-'} · 정원 {r.capacity} · {r.status}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3 style={{ marginTop: 0 }}>차단 시간(슬롯에 즉시 반영)</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label className="label">유형</label>
            <input className="input" style={{ width: 120 }} value={blockForm.type} onChange={(e) => setBlockForm((p) => ({ ...p, type: e.target.value }))} />
          </div>
          <div>
            <label className="label">시작(ISO)</label>
            <input className="input" style={{ width: 200 }} type="datetime-local" value={blockForm.startAt} onChange={(e) => setBlockForm((p) => ({ ...p, startAt: e.target.value }))} />
          </div>
          <div>
            <label className="label">종료</label>
            <input className="input" style={{ width: 200 }} type="datetime-local" value={blockForm.endAt} onChange={(e) => setBlockForm((p) => ({ ...p, endAt: e.target.value }))} />
          </div>
          <button
            className="btn sm"
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
          </button>
        </div>
        <ul style={{ color: 'var(--muted)', fontSize: 13 }}>
          {blocked.map((b) => (
            <li key={b.id}>
              {b.type ?? '-'} · {new Date(b.start_at).toLocaleString('ko-KR')} ~ {new Date(b.end_at).toLocaleString('ko-KR')}{' '}
              <button className="btn ghost sm" onClick={() => run(() => api.del(`/admin/blocked-times/${b.id}`), '차단 삭제됨')}>
                삭제
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
