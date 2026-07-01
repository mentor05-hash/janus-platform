import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { BlockedTime } from '../api/types';
import { PageHeader, Card, Button, Badge, ErrorText, EmptyState } from '../components/ui';

const TYPES = ['원장 상담', '특강', '모의고사'];
const todayStr = () => new Date().toISOString().slice(0, 10);

const PERM = [
  { lv: 'L1', color: '#7c3aed', name: '본사 관리자', desc: '전 센터 차단 · 정책 설정' },
  { lv: 'L2', color: '#0c9bae', name: '센터장', desc: '자기 센터 전체 차단' },
  { lv: 'L3', color: '#64748b', name: '과목 책임', desc: '담당 과목 시간만 차단' },
];

export function AdminBlockPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<BlockedTime[]>([]);
  const [type, setType] = useState('원장 상담');
  const [date, setDate] = useState(todayStr());
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('20:00');
  const [scope, setScope] = useState('center');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await api.get<BlockedTime[]>('/admin/blocked-times'));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    setMsg('');
    try {
      await api.post('/admin/blocked-times', {
        type,
        startAt: new Date(`${date}T${start}:00`).toISOString(),
        endAt: new Date(`${date}T${end}:00`).toISOString(),
        scope,
      });
      setMsg('차단 일정이 등록되었습니다.');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '등록 실패');
    }
  }
  async function remove(id: string) {
    try { await api.del(`/admin/blocked-times/${id}`); await load(); } catch (e) { setError(e instanceof ApiError ? e.message : '해제 실패'); }
  }

  const fmt = (s: string) => new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div>
      <PageHeader title="신청불가 시간 설정" sub="원장 상담·특강·모의고사 등으로 예약을 차단합니다. 권한 등급에 따라 설정 범위가 달라요." />
      <ErrorText>{error}</ErrorText>
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13, marginTop: -8 }}>{msg}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px,380px) 1fr', gap: 16, alignItems: 'start' }}>
        {/* 새 차단 일정 */}
        <Card title="새 차단 일정">
          <label className="label">유형</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {TYPES.map((t) => (
              <button key={t} className="btn sm" style={chip(type === t, t === '원장 상담')} onClick={() => setType(t)}>{t}</button>
            ))}
          </div>
          <label className="label" style={{ marginTop: 12 }}>날짜 · 시간</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            <span style={{ alignSelf: 'center' }}>~</span>
            <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <label className="label" style={{ marginTop: 12 }}>적용 범위</label>
          <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="center">{user?.center_id ? '자기 센터 전체' : '센터 전체'}</option>
            <option value="subject">담당 과목만</option>
          </select>
          <Button block style={{ marginTop: 12 }} onClick={add}>차단 등록</Button>
        </Card>

        <div style={{ display: 'grid', gap: 16 }}>
          {/* 등록된 차단 일정 */}
          <Card title="등록된 차단 일정">
            {rows.length === 0 ? (
              <EmptyState>등록된 차단 일정이 없습니다.</EmptyState>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {rows.map((b) => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, borderBottom: '1px solid var(--line-soft)', paddingBottom: 8 }}>
                    <Badge kind="soft">{b.type ?? '차단'}</Badge>
                    <span>{fmt(b.start_at)} ~ {new Date(b.end_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span style={{ color: 'var(--muted)' }}>{b.scope === 'subject' ? '과목' : '센터'}</span>
                    <Button size="sm" variant="ghost" style={{ marginLeft: 'auto' }} onClick={() => remove(b.id)}>해제</Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 권한 등급 */}
          <Card title="권한 등급">
            <div style={{ display: 'grid', gap: 10 }}>
              {PERM.map((p) => (
                <div key={p.lv} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 30, height: 24, borderRadius: 6, background: p.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{p.lv}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>{p.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function chip(active: boolean, purple = false): React.CSSProperties {
  const c = purple ? '#7c3aed' : 'var(--teal)';
  return {
    flex: 1,
    background: active ? (purple ? '#f4f1fa' : 'var(--teal-50)') : '#fff',
    color: active ? c : 'var(--muted)',
    border: `1px solid ${active ? (purple ? '#ddd2f0' : 'var(--teal-100)') : 'var(--line)'}`,
    boxShadow: 'none',
  };
}
