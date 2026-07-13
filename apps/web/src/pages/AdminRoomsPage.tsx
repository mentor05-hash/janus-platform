import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Room } from '../api/types';
import { PageHeader, Card, Button, Badge, Spinner, ErrorText, Table } from '../components/ui';
import type { Column } from '../components/ui';
import { StatCard, StatGrid } from '../components/dashboard/widgets';

const STATUS: Record<string, { label: string; kind: 'done' | 'confirmed' | 'cancelled' }> = {
  open: { label: '이용 가능', kind: 'done' },
  available: { label: '이용 가능', kind: 'done' },
  busy: { label: '사용 중', kind: 'confirmed' },
  occupied: { label: '사용 중', kind: 'confirmed' },
  inuse: { label: '사용 중', kind: 'confirmed' },
  closed: { label: '운영 종료', kind: 'cancelled' },
};

export function AdminRoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  type Avail = { total: number; workingTeachers: number; available: number; inUse: number; util: number; autoAvailable: number; manualAvailable: number };
  const [avail, setAvail] = useState<Avail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ type: '', capacity: 1 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRooms(await api.get<Room[]>('/admin/rooms'));
      setAvail(await api.get<Avail>('/admin/rooms/availability').catch(() => null));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function addRoom() {
    if (!form.type.trim()) return alert('유형을 입력하세요');
    setMsg('');
    try {
      await api.post('/admin/rooms', form);
      setForm({ type: '', capacity: 1 });
      setMsg('상담실이 추가되었습니다.');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '추가 실패');
    }
  }
  async function saveRoom(id: string, patch: Record<string, unknown>) {
    setMsg('');
    try { await api.put(`/admin/rooms/${id}`, patch); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '수정 실패'); }
  }
  async function delRoom(id: string) {
    if (!window.confirm('이 상담실을 삭제할까요?')) return;
    setMsg('');
    try { await api.del(`/admin/rooms/${id}`); setMsg('상담실이 삭제되었습니다.'); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '삭제 실패'); }
  }
  const nextStatus = (s: string | null) => (s === 'available' || s === 'open' ? 'inuse' : s === 'inuse' || s === 'busy' || s === 'occupied' ? 'closed' : 'available');

  const total = avail?.total ?? rooms.length;
  const available = avail?.available ?? (rooms.length - rooms.filter((r) => r.status === 'closed').length);
  const inUse = avail?.inUse ?? 0;
  const util = avail?.util ?? (total ? Math.round((inUse / total) * 100) : 0);

  const columns: Column<Room>[] = [
    { key: 'name', header: '상담실', render: (r) => <strong>{r.type ?? '상담실'}</strong> },
    { key: 'type', header: '유형', render: (r) => r.type ?? '-' },
    { key: 'cap', header: '수용', render: (r) => `${r.capacity ?? 1}명` },
    { key: 'hours', header: '운영 시간', render: (r) => r.operating_hours ?? '자동' },
    { key: 'setting', header: '설정', render: (r) => (
      <button onClick={() => saveRoom(r.id, { setting: r.setting === 'manual' ? 'auto' : 'manual' })}
        style={{ cursor: 'pointer', border: '1px solid var(--line)', borderRadius: 7, padding: '3px 9px', fontSize: 12, fontWeight: 700, background: r.setting === 'manual' ? 'var(--teal-50,#EEF4FB)' : '#fff', color: r.setting === 'manual' ? 'var(--teal)' : 'var(--muted)' }}>
        {r.setting === 'manual' ? '수동 설정' : '자동 계산'}
      </button>
    ) },
    { key: 'status', header: '상태', render: (r) => { const s = STATUS[r.status ?? 'open'] ?? STATUS.open; return <button onClick={() => saveRoom(r.id, { status: nextStatus(r.status) })} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}><Badge kind={s.kind}>{s.label} ⟳</Badge></button>; } },
    { key: 'actions', header: '', align: 'right', render: (r) => <Button size="sm" variant="danger" onClick={() => delRoom(r.id)}>삭제</Button> },
  ];

  return (
    <div>
      <PageHeader title="상담실 현황" sub="센터의 상담실 수와 운영 시간을 확인·설정하세요." />
      <ErrorText>{error}</ErrorText>
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13, marginTop: -8 }}>{msg}</p>}

      <StatGrid>
        <StatCard label="총 상담실" value={total} unit="실" />
        <StatCard label="현재 이용 가능" value={available} unit="실" />
        <StatCard label="사용 중" value={inUse} unit="실" />
        <StatCard label="오늘 가동률" value={util} unit="%" />
      </StatGrid>

      <div style={{ background: 'var(--teal-50)', border: '1px solid var(--teal-100)', borderRadius: 12, padding: '12px 14px', margin: '16px 0', fontSize: 13, color: 'var(--ink-body)' }}>
        💡 <b>자동 계산</b> — 자동 설정 상담실의 이용 가능 = <b>자동 상담실 수 − 현재 근무 중인 과목 선생님 수</b>로 실시간 계산됩니다.
        {avail && <span> 지금 근무 중 선생님 <b>{avail.workingTeachers}명</b> · 자동 가용 <b>{avail.autoAvailable}</b> · 수동 가용 <b>{avail.manualAvailable}</b>.</span>}
      </div>

      <Card title="상담실 목록" actions={
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <input className="input" style={{ width: 120 }} placeholder="유형(예: 1인실)" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} />
          <input className="input" style={{ width: 70 }} type="number" value={form.capacity} onChange={(e) => setForm((p) => ({ ...p, capacity: Number(e.target.value) }))} />
          <Button size="sm" onClick={addRoom}>추가</Button>
        </span>
      }>
        {loading ? <Spinner /> : <Table columns={columns} rows={rooms} rowKey={(r) => r.id} empty="등록된 상담실이 없습니다." />}
      </Card>
    </div>
  );
}
