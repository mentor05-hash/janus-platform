import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { track } from '../utils/track';

type Item = { bookingId: string; sentAt: string | null; openedAt: string | null; startAt: string | null; teacherName: string | null; category: string | null };
type Detail = { bookingId: string; covered: string[]; diagnosis: string; nextActions: string[]; sentAt: string | null };

const D = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/** R4 — 학생: 발송된 상담 요약 리포트 열람(첫 열람 시 서버가 opened_at 스탬프). */
export function StudentReportsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [det, setDet] = useState<Detail | null>(null);

  useEffect(() => { api.get<Item[]>('/media/reports/student').then(setItems).catch(() => setItems([])); }, []);

  async function open(bookingId: string) {
    setSel(bookingId);
    try {
      const d = await api.get<Detail>(`/media/reports/${bookingId}`);
      setDet(d);
      track('consult_report', 'view', undefined, { ev: 'report_opened', bookingId });
    } catch { setDet(null); }
  }

  return (
    <div>
      <h1 className="page-title">상담 리포트</h1>
      <p className="page-sub">녹음 동의한 상담의 요약 리포트예요. 선생님이 검수한 뒤에 도착합니다.</p>
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
            : !det ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>불러오는 중…</p>
            : (
              <>
                <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>📋 상담 요약 리포트</h2>
                <p style={{ fontSize: 12, color: 'var(--caption)', margin: '0 0 14px' }}>도착 {D(det.sentAt)}</p>
                <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>오늘 다룬 내용</h3>
                <ul style={{ margin: '0 0 14px', paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>
                  {det.covered.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
                <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>진단·관찰</h3>
                <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{det.diagnosis}</p>
                <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>다음 액션 ✅</h3>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>
                  {det.nextActions.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </>
            )}
        </div>
      </div>
    </div>
  );
}
