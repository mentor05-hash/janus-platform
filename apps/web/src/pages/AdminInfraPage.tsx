import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { BlockedTime, Room, ZoomPolicy } from '../api/types';
import { PageHeader, Card, Button, Badge, ErrorText, EmptyState } from '../components/ui';

const ZDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const ZHOURS = [14, 15, 16, 17, 18, 19, 20];

export function AdminInfraPage() {
  const [zoom, setZoom] = useState<number>(6);
  const [allowMap, setAllowMap] = useState<Record<string, boolean>>({});
  const [rooms, setRooms] = useState<Room[]>([]);
  const [blocked, setBlocked] = useState<BlockedTime[]>([]);
  const [roomForm, setRoomForm] = useState({ type: '', capacity: 1 });
  const [blockForm, setBlockForm] = useState({ type: '', startAt: '', endAt: '', scope: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const zp = await api.get<ZoomPolicy>('/admin/zoom-policy');
      setZoom(zp.concurrent_limit);
      setAllowMap(zp.allow_map ?? {});
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

      <Card title="줌 가능 시간" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <label className="label" style={{ margin: 0 }}>동시 줌 한도</label>
          <input className="input" style={{ width: 90 }} type="number" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          <Button size="sm" onClick={() => run(() => api.put('/admin/zoom-policy', { concurrentLimit: zoom, allowMap }), '줌 설정 저장됨')}>저장</Button>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>칸을 클릭해 허용/차단을 토글하세요.</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `46px repeat(7, 1fr)`, gap: 4, maxWidth: 560 }}>
          <div />
          {ZDAYS.map((d) => <div key={d} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{d}</div>)}
          {ZHOURS.map((h) => (
            <div key={h} style={{ display: 'contents' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right', paddingRight: 4, alignSelf: 'center' }}>{h}시</div>
              {ZDAYS.map((_, di) => {
                const key = `${di}-${h}`;
                const allowed = allowMap[key] !== false;
                return (
                  <button key={key} onClick={() => setAllowMap((p) => ({ ...p, [key]: !(p[key] !== false) }))}
                    style={{ height: 26, borderRadius: 6, cursor: 'pointer', border: allowed ? '1px solid #AFC8F4' : '1px solid var(--line)', background: allowed ? '#D6E4FB' : '#f4f6f7', color: allowed ? '#2563EB' : 'var(--muted)', fontSize: 10, fontWeight: 700 }}>
                    {allowed ? '허용' : '차단'}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#D6E4FB', border: '1px solid #AFC8F4', verticalAlign: 'middle', marginRight: 4 }} />허용</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#f4f6f7', border: '1px solid var(--line)', verticalAlign: 'middle', marginRight: 4 }} />차단</span>
        </div>
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
