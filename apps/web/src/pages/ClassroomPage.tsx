import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import { Button, TextField, ErrorText } from '../components/ui';

interface ClassRow { id: string; title: string; status: string; roomId: string | null; createdAt: string; }
interface RosterRow { id: string; studentId: string | null; name: string | null; role: string; joined: boolean; }

const STATUS_LABEL: Record<string, string> = { scheduled: '예정', live: '진행 중', ended: '종료', canceled: '취소' };

// 선생님 강의실 — 개설 · 목록 · 시작/종료 · 입장(판서+음성) · 학생 명단/초대.
export function ClassroomPage() {
  const [rows, setRows] = useState<ClassRow[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [openId, setOpenId] = useState('');
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [addIds, setAddIds] = useState('');

  async function load() { try { setRows(await api.get<ClassRow[]>('/classes')); } catch { /* ignore */ } }
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
      let media = '';
      try {
        const m = await api.get<{ provider: string; url: string | null; token: string | null }>(`/classes/${row.id}/media-token`);
        if (m.provider === 'livekit' && m.url && m.token) media = `&mediaUrl=${encodeURIComponent(m.url)}&mediaToken=${encodeURIComponent(m.token)}&publish=${j.role === 'host' ? '1' : '0'}`;
      } catch { /* 음성 미설정 */ }
      window.open(`/room?url=${encodeURIComponent(j.url)}&token=${encodeURIComponent(j.token)}&kind=whiteboard&title=${encodeURIComponent(row.title)}${media}`, '_blank', 'noopener');
    } catch (e) { setErr(e instanceof ApiError ? e.message : '입장 실패'); }
  }
  async function toggleRoster(id: string) {
    if (openId === id) { setOpenId(''); return; }
    setOpenId(id); setRoster([]); setAddIds('');
    try { setRoster(await api.get<RosterRow[]>(`/classes/${id}/roster`)); } catch (e) { setErr(e instanceof ApiError ? e.message : '명단 조회 실패'); }
  }
  async function addStudents(id: string) {
    const ids = addIds.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return;
    setErr('');
    try { await api.post(`/classes/${id}/enroll`, { studentIds: ids }); setAddIds(''); setRoster(await api.get<RosterRow[]>(`/classes/${id}/roster`)); }
    catch (e) { setErr(e instanceof ApiError ? e.message : '학생 등록 실패(학생 계정 ID 확인)'); }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ margin: '0 0 4px' }}>온라인 강의실</h2>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>여러 학생에게 판서 강의를 진행합니다. 개설 후 학생을 등록하고, 입장하면 판서·음성이 열립니다.</p>

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
            <div key={r.id} className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <b>{r.title}</b>
                  <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: r.status === 'live' ? 'var(--good, #1e7a4d)' : 'var(--muted)' }}>{STATUS_LABEL[r.status] ?? r.status}</span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => toggleRoster(r.id)}>{openId === r.id ? '명단 닫기' : '명단'}</Button>
                {r.status === 'scheduled' && <Button size="sm" variant="ghost" onClick={() => act(r.id, '/start')}>시작</Button>}
                {r.status === 'live' && <Button size="sm" variant="ghost" onClick={() => act(r.id, '/end')}>종료</Button>}
                <Button size="sm" variant="ghost" disabled={!r.roomId} onClick={() => enter(r)}>입장</Button>
              </div>
              {openId === r.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>등록 {roster.length}명 · 입장 {roster.filter((x) => x.joined).length}명</div>
                  {roster.length > 0 && (
                    <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 13 }}>
                      {roster.map((s) => <li key={s.id}>{s.name ?? s.studentId?.slice(0, 8) ?? '학생'} <span style={{ color: s.joined ? 'var(--good, #1e7a4d)' : 'var(--muted)' }}>· {s.joined ? '입장' : '미입장'}</span>{s.role === 'presenter' && <span style={{ color: 'var(--gold-d, #c98a25)' }}> · 발표자</span>}</li>)}
                    </ul>
                  )}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}><TextField label="학생 등록 (계정 ID, 쉼표로 여러 명)" value={addIds} onChange={(e) => setAddIds(e.target.value)} placeholder="학생 account UUID …" /></div>
                    <Button size="sm" variant="ghost" onClick={() => addStudents(r.id)}>등록</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
