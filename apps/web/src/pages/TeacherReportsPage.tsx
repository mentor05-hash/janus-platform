import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { track } from '../utils/track';

type Item = { bookingId: string; status: string; updatedAt: string; sentAt: string | null; openedAt: string | null; startAt: string | null; studentName: string | null; category: string | null; demo: boolean };
type Detail = { bookingId: string; status: string; covered: string[]; diagnosis: string; nextActions: string[]; demo: boolean; transcript: string | null; sentAt: string | null; openedAt: string | null };

const D = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const CHIP: Record<string, { label: string; bg: string; fg: string }> = {
  draft: { label: '초안(검수 대기)', bg: '#FEF3CD', fg: '#8a6d1a' },
  approved: { label: '승인됨', bg: 'var(--teal-50,#E8F0F9)', fg: 'var(--teal)' },
  sent: { label: '발송됨', bg: '#E7F6EC', fg: '#2A8A5F' },
};

/** R4 — 선생님 상담 리포트 검수함: AI 초안(전건 검수) → 수정 → 승인 → 발송. */
export function TeacherReportsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [det, setDet] = useState<Detail | null>(null);
  const [covered, setCovered] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [next, setNext] = useState('');
  const [showTr, setShowTr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => api.get<Item[]>('/media/reports/mine').then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); track('consult_report', 'view', undefined, { ev: 'review_inbox' }); }, []);

  async function open(bookingId: string) {
    setSel(bookingId); setMsg(''); setShowTr(false);
    try {
      const d = await api.get<Detail>(`/media/reports/${bookingId}`);
      setDet(d); setCovered(d.covered.join('\n')); setDiagnosis(d.diagnosis); setNext(d.nextActions.join('\n'));
    } catch { setDet(null); setMsg('리포트를 불러오지 못했어요.'); }
  }
  const lines = (v: string) => v.split('\n').map((s) => s.trim()).filter(Boolean);
  async function saveEdit() {
    if (!sel) return; setBusy(true);
    try { await api.patch(`/media/reports/${sel}`, { covered: lines(covered), diagnosis: diagnosis.trim(), nextActions: lines(next) }); setMsg('저장했어요.'); await load(); }
    catch (e) { setMsg((e as Error).message || '저장 실패'); } finally { setBusy(false); }
  }
  async function doApprove() {
    if (!sel) return; setBusy(true);
    try { await saveEdit(); await api.post(`/media/reports/${sel}/approve`); setMsg('승인했어요. 발송을 누르면 학생에게 전달됩니다.'); await load(); await open(sel); }
    catch (e) { setMsg((e as Error).message || '승인 실패'); } finally { setBusy(false); }
  }
  async function doSend() {
    if (!sel || !confirm('학생에게 리포트를 발송할까요? 발송 후에는 수정할 수 없어요.')) return; setBusy(true);
    try { await api.post(`/media/reports/${sel}/send`); track('consult_report', 'cta', 'send', { ev: 'report_sent', bookingId: sel }); setMsg('발송했어요.'); await load(); await open(sel); }
    catch (e) { setMsg((e as Error).message || '발송 실패'); } finally { setBusy(false); }
  }
  async function doRebuild() {
    if (!sel || !confirm('AI 초안을 다시 생성할까요? 현재 편집 내용은 초안으로 대체됩니다.')) return; setBusy(true);
    try { await api.post(`/media/reports/${sel}/rebuild`); setMsg('재생성을 요청했어요. 잠시 후 새로고침해 주세요.'); }
    catch (e) { setMsg((e as Error).message || '재생성 실패'); } finally { setBusy(false); }
  }

  return (
    <div>
      <h1 className="page-title">상담 리포트</h1>
      <p className="page-sub">녹음 상담의 AI 요약 초안을 검수하고 학생에게 발송합니다. 모든 리포트는 선생님 검수 후에만 발송돼요.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ padding: 10 }}>
          {items.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13, padding: 10 }}>아직 리포트가 없어요. 녹음 동의된 상담이 끝나면 초안이 생성됩니다.</p>}
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
                  {D(it.startAt)}{it.category ? ` · ${it.category}` : ''}{it.demo && it.status === 'draft' ? ' · ⚠ 데모 초안' : ''}
                  {it.status === 'sent' && (it.openedAt ? ' · 열람됨' : ' · 미열람')}
                </div>
              </button>
            );
          })}
        </div>
        <div className="card" style={{ padding: 16 }}>
          {!sel ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>왼쪽에서 리포트를 선택하세요.</p>
            : !det ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>{msg || '불러오는 중…'}</p>
            : (
              <>
                {det.demo && det.status === 'draft' && (
                  <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#FEF3CD', border: '1px solid #F5D889', color: '#8a6d1a', fontSize: 12.5 }}>
                    ⚠ STT/AI 실엔진 미연동 상태의 데모 초안입니다 — 내용을 직접 작성해 주세요.
                  </div>
                )}
                <label style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>오늘 다룬 내용 (줄바꿈으로 구분)</label>
                <textarea className="input" rows={4} value={covered} onChange={(e) => setCovered(e.target.value)} disabled={det.status === 'sent'} style={{ width: '100%', marginTop: 4, marginBottom: 12, resize: 'vertical' }} />
                <label style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>진단·관찰</label>
                <textarea className="input" rows={4} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} disabled={det.status === 'sent'} style={{ width: '100%', marginTop: 4, marginBottom: 12, resize: 'vertical' }} />
                <label style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>다음 액션 (줄바꿈으로 구분)</label>
                <textarea className="input" rows={4} value={next} onChange={(e) => setNext(e.target.value)} disabled={det.status === 'sent'} style={{ width: '100%', marginTop: 4, marginBottom: 12, resize: 'vertical' }} />
                {det.transcript != null && (
                  <div style={{ marginBottom: 12 }}>
                    <button className="btn ghost sm" onClick={() => setShowTr((v) => !v)}>{showTr ? '전사문 접기' : '전사문 보기'}</button>
                    {showTr && <pre style={{ marginTop: 8, maxHeight: 220, overflow: 'auto', fontSize: 12.5, whiteSpace: 'pre-wrap', background: 'var(--surface-2,#f4f7fb)', borderRadius: 8, padding: 12 }}>{det.transcript}</pre>}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {det.status !== 'sent' && <>
                    <button className="btn ghost sm" disabled={busy} onClick={saveEdit}>저장</button>
                    <button className="btn ghost sm" disabled={busy} onClick={doRebuild}>초안 재생성</button>
                    {det.status === 'draft' && <button className="btn sm" disabled={busy} onClick={doApprove}>승인</button>}
                    {det.status === 'approved' && <button className="btn sm" disabled={busy} onClick={doSend}>📤 학생에게 발송</button>}
                  </>}
                  {det.status === 'sent' && <span style={{ fontSize: 13, color: 'var(--muted)' }}>발송됨 · {D(det.sentAt)} {det.openedAt ? `· 학생 열람 ${D(det.openedAt)}` : '· 아직 열람 전'}</span>}
                  {msg && <span style={{ fontSize: 12.5, color: 'var(--teal)' }}>{msg}</span>}
                </div>
              </>
            )}
        </div>
      </div>
    </div>
  );
}
