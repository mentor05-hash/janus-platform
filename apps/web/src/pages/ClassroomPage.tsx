import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import { Button, TextField, ErrorText } from '../components/ui';

interface ClassRow { id: string; title: string; status: string; roomId: string | null; createdAt: string; }

const STATUS_LABEL: Record<string, string> = { scheduled: '예정', live: '진행 중', ended: '종료', canceled: '취소' };

// 선생님 강의실 — 개설 · 목록 · 시작/종료 · 입장(화이트보드) · 녹화.
export function ClassroomPage() {
  const [rows, setRows] = useState<ClassRow[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    try { setRows(await api.get<ClassRow[]>('/classes')); } catch { /* ignore */ }
  }
  useEffect(() => { void load(); }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true); setErr('');
    try { await api.post('/classes', { title: title.trim() }); setTitle(''); await load(); }
    catch (e2) { setErr(e2 instanceof ApiError ? e2.message : '개설 실패'); }
    finally { setBusy(false); }
  }
  async function act(id: string, path: string) {
    setErr('');
    try { await api.post(`/classes/${id}${path}`); await load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : '요청 실패'); }
  }
  async function enter(row: ClassRow) {
    setErr('');
    try {
      const j = await api.post<{ url: string; token: string; role: string }>(`/classes/${row.id}/join`, {});
      const u = `/room?url=${encodeURIComponent(j.url)}&token=${encodeURIComponent(j.token)}&kind=whiteboard&title=${encodeURIComponent(row.title)}`;
      window.open(u, '_blank', 'noopener');
    } catch (e) { setErr(e instanceof ApiError ? e.message : '입장 실패'); }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ margin: '0 0 4px' }}>온라인 강의실</h2>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>여러 학생에게 판서 강의를 진행합니다. 개설하면 강의실이 만들어지고, 입장 링크로 학생이 들어옵니다.</p>

      <form onSubmit={create} className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 18 }}>
        <div style={{ flex: 1 }}><TextField label="강의 제목" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 고3 수학 미적분 특강" /></div>
        <Button type="submit" disabled={busy}>{busy ? '개설 중…' : '강의 개설'}</Button>
      </form>
      {err && <ErrorText>{err}</ErrorText>}

      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>아직 개설한 강의가 없습니다.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r) => (
            <div key={r.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <b>{r.title}</b>
                <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: r.status === 'live' ? 'var(--good, #1e7a4d)' : 'var(--muted)' }}>{STATUS_LABEL[r.status] ?? r.status}</span>
              </div>
              {r.status === 'scheduled' && <Button variant="ghost" onClick={() => act(r.id, '/start')}>시작</Button>}
              {r.status === 'live' && <Button variant="ghost" onClick={() => act(r.id, '/end')}>종료</Button>}
              <Button variant="ghost" disabled={!r.roomId} onClick={() => enter(r)}>입장(판서)</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
