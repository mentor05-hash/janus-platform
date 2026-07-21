import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { track } from '../utils/track';

type Item = { bookingId: string; status: string; updatedAt: string; sentAt: string | null; openedAt: string | null; startAt: string | null; studentName: string | null; category: string | null; demo: boolean; hasViews: boolean };
type StudentView = { covered: string[]; reviewPoints: string[]; nextLearning: string[]; demo?: boolean };
type GuardianView = { progress: string; recommendedActions: string[]; effort: string; demo?: boolean };
type Views = { bookingId: string; status: string; source: string; sentAt: string | null; student: StudentView | null; guardian: GuardianView | null; guardianShared: boolean; demo: boolean };

const D = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const CHIP: Record<string, { label: string; bg: string; fg: string }> = {
  note: { label: '메모 기반 · 리포트 생성 가능', bg: '#EEF2F7', fg: '#5b6b82' },
  draft: { label: '초안(검수 대기)', bg: '#FEF3CD', fg: '#8a6d1a' },
  approved: { label: '승인됨', bg: 'var(--teal-50,#E8F0F9)', fg: 'var(--teal)' },
  sent: { label: '발송됨', bg: '#E7F6EC', fg: '#2A8A5F' },
};
const lines = (v: string) => v.split('\n').map((s) => s.trim()).filter(Boolean);

/** 상담 리포트 검수함 — 요약 원천(오디오 or 상담 기록) → 학생용/학부모용 2뷰 생성 → 검수 → 승인 → 발송. */
export function TeacherReportsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [views, setViews] = useState<Views | null>(null);
  const [noViews, setNoViews] = useState(false);
  // 학생 뷰 편집 버퍼
  const [sCovered, setSCovered] = useState(''); const [sReview, setSReview] = useState(''); const [sNext, setSNext] = useState('');
  // 학부모 뷰 편집 버퍼
  const [gProgress, setGProgress] = useState(''); const [gActions, setGActions] = useState(''); const [gEffort, setGEffort] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => api.get<Item[]>('/media/reports/mine').then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); track('consult_report', 'view', undefined, { ev: 'review_inbox' }); }, []);

  function fillBuffers(v: Views) {
    setSCovered((v.student?.covered ?? []).join('\n')); setSReview((v.student?.reviewPoints ?? []).join('\n')); setSNext((v.student?.nextLearning ?? []).join('\n'));
    setGProgress(v.guardian?.progress ?? ''); setGActions((v.guardian?.recommendedActions ?? []).join('\n')); setGEffort(v.guardian?.effort ?? '');
  }
  async function open(bookingId: string) {
    setSel(bookingId); setMsg(''); setViews(null); setNoViews(false);
    try {
      const v = await api.get<Views>(`/media/reports/${bookingId}/views`);
      setViews(v); fillBuffers(v);
    } catch { setNoViews(true); } // 아직 2뷰 없음(메모 기반 or 미생성) → 생성 버튼
  }
  async function generate() {
    if (!sel) return; setBusy(true); setMsg('');
    try {
      const r = await api.post<{ ok: boolean; origin: string; demo: boolean }>(`/media/reports/${sel}/views/generate`, {});
      setMsg(`요약을 만들었어요(원천: ${r.origin === 'audio' ? '녹음 요약' : '상담 기록'}${r.demo ? ' · 데모' : ''}). 검수 후 승인·발송하세요.`);
      await open(sel); await load();
    } catch (e) { setMsg((e as Error).message || '생성 실패'); } finally { setBusy(false); }
  }
  async function saveView(audience: 'student' | 'guardian') {
    if (!sel) return; setBusy(true);
    const patch = audience === 'student'
      ? { audience, covered: lines(sCovered), reviewPoints: lines(sReview), nextLearning: lines(sNext) }
      : { audience, progress: gProgress.trim(), recommendedActions: lines(gActions), effort: gEffort.trim() };
    try { await api.patch(`/media/reports/${sel}/views`, patch); setMsg('저장했어요.'); }
    catch (e) { setMsg((e as Error).message || '저장 실패'); } finally { setBusy(false); }
  }
  async function approve() {
    if (!sel) return; setBusy(true);
    try { await saveView('student'); await saveView('guardian'); await api.post(`/media/reports/${sel}/views/approve`, {}); setMsg('승인했어요. 발송을 누르면 학생 계정에 노출됩니다.'); await open(sel); await load(); }
    catch (e) { setMsg((e as Error).message || '승인 실패'); } finally { setBusy(false); }
  }
  async function send() {
    if (!sel || views?.status !== 'approved') return; // 승인 상태에서만 발송(중복 클릭 가드)
    if (!confirm('학생 계정에 리포트를 발송할까요? 발송 후에는 수정할 수 없어요.\n(학부모 전달은 학생이 직접 공유합니다 — 플랫폼이 학부모에게 직접 보내지 않습니다.)')) return; setBusy(true);
    try {
      await api.post(`/media/reports/${sel}/views/send`, {});
      track('consult_report', 'cta', 'send', { ev: 'report_sent', bookingId: sel });
      setViews((prev) => (prev ? { ...prev, status: 'sent' } : prev)); // 낙관적 — 재조회 전이라도 발송 버튼 즉시 잠금
      setMsg('발송했어요.'); await open(sel); await load();
    } catch (e) { setMsg((e as Error).message || '발송 실패'); } finally { setBusy(false); }
  }

  const editable = views && views.status !== 'sent';
  const box: React.CSSProperties = { width: '100%', marginTop: 4, marginBottom: 12, resize: 'vertical' };

  return (
    <div>
      <h1 className="page-title">상담 리포트</h1>
      <p className="page-sub">녹음 또는 상담 기록에서 <b>학생용·학부모용 요약</b>을 만들어 검수·발송합니다. 학부모 전달은 학생 주도 공유예요 — 플랫폼이 학부모에게 직접 보내지 않습니다.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ padding: 10 }}>
          {items.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13, padding: 10 }}>리포트가 없어요. 녹음 상담이 끝나거나 상담 기록을 저장하면 여기서 요약을 만들 수 있어요.</p>}
          {items.map((it) => {
            const c = CHIP[it.status] ?? CHIP.draft;
            return (
              <button key={it.bookingId} onClick={() => open(it.bookingId)}
                style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', background: sel === it.bookingId ? 'var(--teal-50,#E8F0F9)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <b style={{ fontSize: 14 }}>{it.studentName ?? '학생'}</b>
                  <span style={{ fontSize: 11, background: c.bg, color: c.fg, borderRadius: 999, padding: '2px 8px', fontWeight: 700 }}>{c.label}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {D(it.startAt)}{it.category ? ` · ${it.category}` : ''}{it.hasViews ? ' · 요약 있음' : ''}
                  {it.status === 'sent' && (it.openedAt ? ' · 열람됨' : ' · 미열람')}
                </div>
              </button>
            );
          })}
        </div>
        <div className="card" style={{ padding: 16 }}>
          {!sel ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>왼쪽에서 상담을 선택하세요.</p>
            : noViews ? (
              <div>
                <p style={{ fontSize: 13.5, color: 'var(--ink)' }}>아직 만든 요약이 없어요. 원천(녹음 요약 또는 상담 기록의 핵심 요약)에서 학생용·학부모용 요약을 만드세요.</p>
                <button className="btn sm" disabled={busy} onClick={generate}>✨ 학생·학부모용 요약 만들기</button>
                {msg && <p style={{ fontSize: 12.5, color: 'var(--teal)', marginTop: 8 }}>{msg}</p>}
              </div>
            )
            : !views ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>불러오는 중…</p>
            : (
              <>
                {views.demo && views.status !== 'sent' && (
                  <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#FEF3CD', border: '1px solid #F5D889', color: '#8a6d1a', fontSize: 12.5 }}>
                    ⚠ LLM 실엔진 미연동 상태의 데모 초안입니다 — 내용을 직접 검수해 주세요.
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--caption)', marginBottom: 12 }}>원천: {views.source === 'audio' ? '녹음 요약' : '상담 기록(메모)'} · 상태: {CHIP[views.status]?.label ?? views.status}{views.sentAt ? ` · 발송 ${D(views.sentAt)}` : ''}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                  {/* 학생용 뷰 */}
                  <div>
                    <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>🎓 학생용 뷰</h3>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>오늘 다룬 내용</label>
                    <textarea className="input" rows={4} value={sCovered} onChange={(e) => setSCovered(e.target.value)} disabled={!editable} style={box} />
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>복습 포인트</label>
                    <textarea className="input" rows={3} value={sReview} onChange={(e) => setSReview(e.target.value)} disabled={!editable} style={box} />
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>다음 학습</label>
                    <textarea className="input" rows={3} value={sNext} onChange={(e) => setSNext(e.target.value)} disabled={!editable} style={box} />
                    {editable && <button className="btn ghost sm" disabled={busy} onClick={() => saveView('student')}>학생 뷰 저장</button>}
                  </div>
                  {/* 학부모용 뷰 */}
                  <div>
                    <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>👪 학부모용 뷰 <span style={{ fontSize: 11, color: 'var(--caption)', fontWeight: 400 }}>(과정·상품 추천 가능 · 구체 금액은 미기재)</span></h3>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>진척 요지</label>
                    <textarea className="input" rows={4} value={gProgress} onChange={(e) => setGProgress(e.target.value)} disabled={!editable} style={box} />
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>권장 다음 액션</label>
                    <textarea className="input" rows={3} value={gActions} onChange={(e) => setGActions(e.target.value)} disabled={!editable} style={box} />
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>소요·권장 안내</label>
                    <textarea className="input" rows={2} value={gEffort} onChange={(e) => setGEffort(e.target.value)} disabled={!editable} style={box} />
                    {editable && <button className="btn ghost sm" disabled={busy} onClick={() => saveView('guardian')}>학부모 뷰 저장</button>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 14, borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>
                  {views.status !== 'sent' && <>
                    <button className="btn ghost sm" disabled={busy} onClick={generate}>초안 재생성</button>
                    {views.status === 'draft' && <button className="btn sm" disabled={busy} onClick={approve}>승인</button>}
                    {views.status === 'approved' && <button className="btn sm" disabled={busy} onClick={send}>{busy ? '발송 중…' : '📤 학생에게 발송'}</button>}
                  </>}
                  {views.status === 'sent' && <span style={{ fontSize: 13, color: 'var(--muted)' }}>발송됨 · {D(views.sentAt)}{views.guardianShared ? ' · 학생이 학부모에게 공유함' : ''}</span>}
                  {msg && <span style={{ fontSize: 12.5, color: 'var(--teal)' }}>{msg}</span>}
                </div>
              </>
            )}
        </div>
      </div>
    </div>
  );
}
