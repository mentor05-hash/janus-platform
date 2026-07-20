import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { track } from '../utils/track';

type Item = { bookingId: string; sentAt: string | null; openedAt: string | null; startAt: string | null; teacherName: string | null; category: string | null };
type StudentView = { covered: string[]; reviewPoints: string[]; nextLearning: string[] };
type GuardianView = { progress: string; recommendedActions: string[]; effort: string };
type Views = { bookingId: string; status: string; sentAt: string | null; student: StudentView | null; guardian: GuardianView | null; guardianShared: boolean };

const D = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/** 학생 — 발송된 상담 리포트 2뷰 열람(학생용 기본 + 학부모용 확인 후 "학부모께 공유"). */
export function StudentReportsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [v, setV] = useState<Views | null>(null);
  const [tab, setTab] = useState<'student' | 'guardian'>('student');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { api.get<Item[]>('/media/reports/student').then(setItems).catch(() => setItems([])); }, []);

  async function open(bookingId: string) {
    setSel(bookingId); setTab('student'); setMsg('');
    try {
      const d = await api.get<Views>(`/media/reports/${bookingId}/views`);
      setV(d);
      track('consult_report', 'view', undefined, { ev: 'report_opened', bookingId });
    } catch { setV(null); }
  }
  async function shareToGuardian() {
    if (!sel || !confirm('이 리포트의 학부모용 요약을 학부모에게 공유할까요? 연결된 학부모가 열람할 수 있게 됩니다.')) return;
    setBusy(true);
    try { await api.post(`/media/reports/${sel}/share-guardian`, {}); setMsg('학부모에게 공유했어요.'); await open(sel); }
    catch (e) { setMsg((e as Error).message || '공유 실패'); } finally { setBusy(false); }
  }

  return (
    <div>
      <h1 className="page-title">상담 리포트</h1>
      <p className="page-sub">선생님이 검수한 상담 요약이에요. 학생용 요약과, 부모님께 보여드릴 학부모용 요약을 함께 확인할 수 있어요.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ padding: 10 }}>
          {items.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13, padding: 10 }}>도착한 리포트가 아직 없어요.</p>}
          {items.map((it) => (
            <button key={it.bookingId} onClick={() => open(it.bookingId)}
              style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', background: sel === it.bookingId ? 'var(--teal-50,#E8F0F9)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <b style={{ fontSize: 14 }}>{it.teacherName ?? '선생님'} 선생님</b>
                {!it.openedAt && <span style={{ fontSize: 11, background: 'var(--danger,#dc2626)', color: '#fff', borderRadius: 999, padding: '2px 8px', fontWeight: 700 }}>NEW</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{D(it.startAt)}{it.category ? ` · ${it.category}` : ''}</div>
            </button>
          ))}
        </div>
        <div className="card" style={{ padding: 18 }}>
          {!sel ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>왼쪽에서 리포트를 선택하세요.</p>
            : !v ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>불러오는 중…</p>
            : (
              <>
                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                  {(['student', 'guardian'] as const).map((t) => (
                    <button key={t} onClick={() => setTab(t)} className={tab === t ? 'btn sm' : 'btn ghost sm'}>
                      {t === 'student' ? '🎓 학생용' : '👪 학부모용'}
                    </button>
                  ))}
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--caption)', alignSelf: 'center' }}>도착 {D(v.sentAt)}</span>
                </div>

                {tab === 'student' && v.student && (
                  <>
                    <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>오늘 다룬 내용</h3>
                    <ul style={{ margin: '0 0 14px', paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>{v.student.covered.map((c, i) => <li key={i}>{c}</li>)}</ul>
                    <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>복습 포인트</h3>
                    <ul style={{ margin: '0 0 14px', paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>{v.student.reviewPoints.map((c, i) => <li key={i}>{c}</li>)}</ul>
                    <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>다음 학습 ✅</h3>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>{v.student.nextLearning.map((c, i) => <li key={i}>{c}</li>)}</ul>
                  </>
                )}

                {tab === 'guardian' && v.guardian && (
                  <>
                    <div style={{ marginBottom: 12, padding: '9px 12px', borderRadius: 8, background: 'var(--teal-50,#EEF4FB)', fontSize: 12.5, color: 'var(--ink-body)' }}>
                      부모님께 보여드릴 요약이에요. {v.guardianShared ? '이미 학부모에게 공유했어요.' : '아래 [학부모께 공유]를 누르면 연결된 학부모가 열람할 수 있어요.'}
                    </div>
                    <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>진척 요지</h3>
                    <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{v.guardian.progress}</p>
                    <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>권장 다음 액션</h3>
                    <ul style={{ margin: '0 0 14px', paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>{v.guardian.recommendedActions.map((c, i) => <li key={i}>{c}</li>)}</ul>
                    {v.guardian.effort && <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--muted)' }}>{v.guardian.effort}</p>}
                    <button className="btn sm" disabled={busy || v.guardianShared} onClick={shareToGuardian}>
                      {v.guardianShared ? '✓ 학부모에게 공유됨' : '📨 학부모께 공유'}
                    </button>
                    {msg && <span style={{ fontSize: 12.5, color: 'var(--teal)', marginLeft: 10 }}>{msg}</span>}
                  </>
                )}
                {tab === 'student' && !v.student && <p style={{ color: 'var(--muted)', fontSize: 13 }}>학생용 요약이 없어요.</p>}
                {tab === 'guardian' && !v.guardian && <p style={{ color: 'var(--muted)', fontSize: 13 }}>학부모용 요약이 없어요.</p>}
              </>
            )}
        </div>
      </div>
    </div>
  );
}
