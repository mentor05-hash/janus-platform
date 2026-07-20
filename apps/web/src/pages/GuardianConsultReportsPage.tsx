import { useEffect, useState } from 'react';
import { api } from '../api/client';

/* 학부모 — 자녀가 공유한 상담 리포트(학부모용 뷰) 열람. 플랫폼이 직접 push 하지 않음(§5) — 학생 주도 공유분만 노출. */

type Child = { studentId: string; name: string };
type Item = { bookingId: string; sharedAt: string | null; openedAt: string | null; startAt: string | null; teacherName: string | null; category: string | null };
type Detail = { bookingId: string; sentAt: string | null; progress: string; recommendedActions: string[]; effort: string };

const D = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export function GuardianConsultReportsPage() {
  const [children, setChildren] = useState<Child[] | null>(null);
  const [sel, setSel] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [det, setDet] = useState<Detail | null>(null);

  useEffect(() => {
    api.get<Child[]>('/guardian/children').then((cs) => { setChildren(cs); if (cs[0]) setSel(cs[0].studentId); }).catch(() => setChildren([]));
  }, []);
  useEffect(() => {
    if (!sel) return;
    setItems([]); setOpenId(null); setDet(null);
    api.get<Item[]>(`/media/reports/guardian/${encodeURIComponent(sel)}`).then(setItems).catch(() => setItems([]));
  }, [sel]);

  async function open(bookingId: string) {
    setOpenId(bookingId);
    try { setDet(await api.get<Detail>(`/media/reports/guardian/${encodeURIComponent(sel)}/${encodeURIComponent(bookingId)}`)); }
    catch { setDet(null); }
  }

  return (
    <div>
      <h1 className="page-title">상담 리포트</h1>
      <p className="page-sub">자녀가 공유한 상담 요약(학부모용)이에요. 자녀가 공유한 리포트만 보여집니다.</p>
      {children && children.length > 1 && (
        <div style={{ marginBottom: 14 }}>
          <select className="input" value={sel} onChange={(e) => setSel(e.target.value)} style={{ maxWidth: 220 }}>
            {children.map((c) => <option key={c.studentId} value={c.studentId}>{c.name}</option>)}
          </select>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ padding: 10 }}>
          {items.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13, padding: 10 }}>공유된 리포트가 아직 없어요.</p>}
          {items.map((it) => (
            <button key={it.bookingId} onClick={() => open(it.bookingId)}
              style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', background: openId === it.bookingId ? 'var(--teal-50,#E8F0F9)' : 'none' }}>
              <b style={{ fontSize: 14 }}>{it.teacherName ?? '선생님'} 선생님</b>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{D(it.startAt)}{it.category ? ` · ${it.category}` : ''} · 공유 {D(it.sharedAt)}</div>
            </button>
          ))}
        </div>
        <div className="card" style={{ padding: 18 }}>
          {!openId ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>왼쪽에서 리포트를 선택하세요.</p>
            : !det ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>불러오는 중…</p>
            : (
              <>
                <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>📋 상담 요약 (학부모용)</h2>
                <p style={{ fontSize: 12, color: 'var(--caption)', margin: '0 0 14px' }}>상담 {D(det.sentAt)}</p>
                <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>진척 요지</h3>
                <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{det.progress}</p>
                <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>권장 다음 액션</h3>
                <ul style={{ margin: '0 0 14px', paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>{det.recommendedActions.map((c, i) => <li key={i}>{c}</li>)}</ul>
                {det.effort && <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>{det.effort}</p>}
              </>
            )}
        </div>
      </div>
    </div>
  );
}
