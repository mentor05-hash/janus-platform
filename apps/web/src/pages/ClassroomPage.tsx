import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import { Button, TextField, ErrorText } from '../components/ui';

interface ClassRow { id: string; title: string; status: string; roomId: string | null; createdAt: string; }
interface RosterRow { id: string; studentId: string | null; name: string | null; role: string; joined: boolean; }
interface StudentHit { studentId: string; name: string; loginId: string | null; totalConsult: number; isHomeroom: boolean; }

const STATUS_LABEL: Record<string, string> = { scheduled: '예정', live: '진행 중', ended: '종료', canceled: '취소' };

// 선생님 강의실 — 개설 · 목록 · 시작/종료 · 입장(판서+음성) · 학생 명단/초대.
export function ClassroomPage() {
  const [rows, setRows] = useState<ClassRow[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [openId, setOpenId] = useState('');
  const [roster, setRoster] = useState<RosterRow[]>([]);
  // 학생 초대 picker — 이름/아이디 검색 → 후보 목록에서 선택(계정 UUID 직접입력 대체).
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<StudentHit[]>([]);
  const [adding, setAdding] = useState(false);
  const searchSeq = useRef(0);

  async function load() { try { setRows(await api.get<ClassRow[]>('/classes')); } catch { /* ignore */ } }
  useEffect(() => { void load(); }, []);

  // 검색어 디바운스(250ms) → 선생님 센터 학생 검색. 명단이 열려 있을 때만 동작.
  useEffect(() => {
    if (!openId) return;
    const kw = query.trim();
    const seq = ++searchSeq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.get<StudentHit[]>(`/me/students?q=${encodeURIComponent(kw)}`);
        if (seq === searchSeq.current) setHits(r);
      } catch { if (seq === searchSeq.current) setHits([]); }
      finally { if (seq === searchSeq.current) setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [query, openId]);

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
  function resetPicker() { setQuery(''); setHits([]); setPicked([]); }
  async function toggleRoster(id: string) {
    if (openId === id) { setOpenId(''); resetPicker(); return; }
    setOpenId(id); setRoster([]); resetPicker();
    try { setRoster(await api.get<RosterRow[]>(`/classes/${id}/roster`)); } catch (e) { setErr(e instanceof ApiError ? e.message : '명단 조회 실패'); }
  }
  function pick(s: StudentHit) {
    setPicked((p) => (p.some((x) => x.studentId === s.studentId) ? p : [...p, s]));
  }
  function unpick(id: string) { setPicked((p) => p.filter((x) => x.studentId !== id)); }
  async function addStudents(id: string) {
    if (picked.length === 0) return;
    setErr(''); setAdding(true);
    try {
      await api.post(`/classes/${id}/enroll`, { studentIds: picked.map((s) => s.studentId) });
      resetPicker();
      setRoster(await api.get<RosterRow[]>(`/classes/${id}/roster`));
    } catch (e) { setErr(e instanceof ApiError ? e.message : '학생 등록 실패'); }
    finally { setAdding(false); }
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
                  {/* 학생 초대 — 이름/아이디 검색 후 목록에서 선택 */}
                  <div style={{ position: 'relative' }}>
                    <TextField label="학생 초대 (이름 또는 아이디로 검색)" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="예: 김민준 / student01" autoComplete="off" />
                    {(searching || hits.length > 0) && (
                      <div style={{ marginTop: 4, border: '1px solid var(--line)', borderRadius: 10, maxHeight: 220, overflowY: 'auto', background: 'var(--surface, #fff)' }}>
                        {searching && hits.length === 0 ? (
                          <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--muted)' }}>검색 중…</div>
                        ) : hits.length === 0 ? (
                          <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--muted)' }}>검색 결과가 없습니다.</div>
                        ) : (
                          hits.map((s) => {
                            const enrolled = roster.some((x) => x.studentId === s.studentId);
                            const chosen = picked.some((x) => x.studentId === s.studentId);
                            return (
                              <button
                                key={s.studentId}
                                type="button"
                                disabled={enrolled}
                                onClick={() => (chosen ? unpick(s.studentId) : pick(s))}
                                style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                                  width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none',
                                  borderTop: '1px solid var(--line)', cursor: enrolled ? 'default' : 'pointer',
                                  background: chosen ? 'var(--teal-50, #eef6fa)' : 'transparent',
                                  opacity: enrolled ? 0.5 : 1,
                                }}
                              >
                                <span style={{ minWidth: 0, fontSize: 13 }}>
                                  <b style={{ color: 'var(--ink)' }}>{s.name}</b>
                                  {s.loginId && <span style={{ color: 'var(--muted)', marginLeft: 6 }}>@{s.loginId}</span>}
                                  <span style={{ color: 'var(--muted)', marginLeft: 8, fontSize: 12 }}>완료 {s.totalConsult}회</span>
                                  {s.isHomeroom && <span style={{ color: 'var(--gold-d, #c98a25)', marginLeft: 6, fontSize: 12 }}>담임</span>}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: enrolled ? 'var(--muted)' : chosen ? 'var(--teal)' : 'var(--muted)' }}>
                                  {enrolled ? '등록됨' : chosen ? '선택됨 ✓' : '추가'}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                  {picked.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                      {picked.map((s) => (
                        <span key={s.studentId} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'var(--teal-50, #eef6fa)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 999, padding: '3px 6px 3px 10px' }}>
                          {s.name}
                          <button type="button" onClick={() => unpick(s.studentId)} aria-label={`${s.name} 제거`} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                        </span>
                      ))}
                      <Button size="sm" variant="ghost" disabled={adding} onClick={() => addStudents(r.id)}>{adding ? '등록 중…' : `${picked.length}명 등록`}</Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
