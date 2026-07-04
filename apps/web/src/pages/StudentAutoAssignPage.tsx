import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, ErrorText, Badge } from '../components/ui';

type Req = { id: string; consult_type: string; mode: string; status: string; assigned_booking_id: string | null; created_at: string };

const CTYPES: [string, string][] = [['담임', '🏫'], ['교과', '📐'], ['입시', '🎯'], ['심리', '💬']];
const MODES: [string, string][] = [['zoom', '줌 화상'], ['chat', '채팅'], ['offline', '오프라인']];
// prisma enum client 값 → 한글(모바일 AutoAssignScreen 과 동일 매핑)
const CT_KO: Record<string, string> = { homeroom: '담임', subject: '교과', admission: '입시', psych: '심리', 담임: '담임', 교과: '교과', 입시: '입시', 심리: '심리' };
const MODE_KO: Record<string, string> = { zoom: '줌 화상', chat: '채팅', hand: '필기', offline: '오프라인' };
const STATUS: Record<string, { label: string; kind: 'confirmed' | 'done' | 'soft' }> = {
  waiting: { label: '대기중', kind: 'confirmed' },
  assigned: { label: '배정완료', kind: 'done' },
  cancelled: { label: '취소됨', kind: 'soft' },
};

const chip = (on: boolean): React.CSSProperties => ({
  padding: '9px 16px', borderRadius: 999, border: `1px solid ${on ? 'var(--teal)' : 'var(--line)'}`,
  background: on ? 'var(--teal)' : '#fff', color: on ? '#fff' : 'var(--muted)', fontWeight: 700, fontSize: 13, cursor: 'pointer',
});

export function StudentAutoAssignPage() {
  const [consultType, setConsultType] = useState('교과');
  const [mode, setMode] = useState('zoom');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [reqs, setReqs] = useState<Req[] | null>(null);

  const load = useCallback(() => {
    api.get<Req[]>('/assignment/auto-request').then(setReqs).catch(() => setReqs([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function submit() {
    setBusy(true); setMsg(''); setError('');
    try {
      await api.post('/assignment/auto-request', { consultType, mode });
      setMsg('신청했어요. 전임 선생님 근무시간의 빈 자리에 자동 배정되면 알림으로 알려드려요.');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '신청 실패');
    } finally { setBusy(false); }
  }
  async function cancel(id: string) {
    try { await api.del(`/assignment/auto-request/${id}`); load(); } catch { /* noop */ }
  }

  return (
    <div>
      <PageHeader title="자동배정 신청" sub="시간을 정하지 않아도 돼요. 전임 선생님의 근무시간 빈 자리에 자동으로 배정됩니다." />
      {error && <ErrorText>{error}</ErrorText>}

      <Card>
        <label className="label">상담 종류</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {CTYPES.map(([v, ic]) => (
            <button key={v} type="button" style={chip(consultType === v)} onClick={() => setConsultType(v)}>{ic} {v}</button>
          ))}
        </div>
        <label className="label">방식</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {MODES.map(([v, l]) => (
            <button key={v} type="button" style={chip(mode === v)} onClick={() => setMode(v)}>{l}</button>
          ))}
        </div>
        <Button onClick={submit} disabled={busy}>{busy ? '신청 중…' : '자동배정 신청'}</Button>
        {msg && <p style={{ color: 'var(--teal)', fontSize: 13, fontWeight: 600, marginTop: 10 }}>{msg}</p>}
      </Card>

      <h3 style={{ marginTop: 24, marginBottom: 10, fontSize: 15 }}>내 신청 현황</h3>
      {reqs === null ? <p style={{ color: 'var(--muted)' }}>불러오는 중…</p>
        : reqs.length === 0 ? <p style={{ color: 'var(--muted)' }}>아직 신청이 없어요.</p>
        : reqs.map((r) => {
          const st = STATUS[r.status] ?? { label: r.status, kind: 'soft' as const };
          return (
            <Card key={r.id} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <b>{CT_KO[r.consult_type] ?? r.consult_type} · {MODE_KO[r.mode] ?? r.mode}</b>
                <Badge kind={st.kind}>{st.label}</Badge>
              </div>
              {r.status === 'waiting' && (
                <button type="button" onClick={() => cancel(r.id)} style={{ marginTop: 10, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'none', color: 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>신청 취소</button>
              )}
              {r.status === 'assigned' && <p style={{ marginTop: 8, fontSize: 12.5, color: 'var(--muted)' }}>예약이 확정됐어요. ‘내 예약·상담’에서 확인하세요.</p>}
            </Card>
          );
        })}
    </div>
  );
}
