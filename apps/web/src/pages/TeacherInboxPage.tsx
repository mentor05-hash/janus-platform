import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, EmptyState, Spinner } from '../components/ui';
import { StatCard, StatGrid } from '../components/dashboard/widgets';

type Inbox = {
  counts: { requests: number; questions: number; unreadChats: number; notifications: number };
  requests: { bookingId: string; studentName: string; consultType: string | null; subType: string | null; mode: string; start: string | null }[];
  questions: { id: string; studentName: string; body: string; assigned: boolean; createdAt: string }[];
  notifications: { id: string; type: string; title: string; body: string; payload?: { bookingId?: string } | null; readAt: string | null; createdAt: string }[];
  unreadByBooking: Record<string, number>;
};
type Filter = 'all' | 'req' | 'q' | 'noti';
const unwrap = <T,>(r: T | { data?: T }): T => (r && typeof r === 'object' && 'data' in (r as object) ? (r as { data: T }).data : r as T);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const MODE: Record<string, string> = { chat: '채팅', zoom: '줌', offline: '대면', hand: '필기', board: '보드' };

/** 선생님 유입 통합 인박스(웹) — /me/inbox 집계 + 필터 + 인라인 수락/거절/답변/읽음. 모바일과 동일 계약. */
export function TeacherInboxPage() {
  const [d, setD] = useState<Inbox | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ansFor, setAnsFor] = useState<string | null>(null);
  const [ansText, setAnsText] = useState('');

  const load = useCallback(() => { api.get<Inbox>('/me/inbox').then((r) => setD(unwrap(r))).catch(() => setD(null)); }, []);
  useEffect(() => { load(); }, [load]);

  async function respond(bookingId: string, action: 'accept' | 'reject') {
    setBusy(bookingId);
    try { await api.patch(`/bookings/${bookingId}/${action}`, {}); setMsg(action === 'accept' ? '상담을 수락했어요.' : '상담을 거절했어요(크레딧 환원).'); load(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : '처리 실패'); } finally { setBusy(null); }
  }
  async function answer(q: Inbox['questions'][number]) {
    if (!ansText.trim()) return;
    setBusy(q.id);
    try {
      if (!q.assigned) await api.post(`/qna/posts/${q.id}/claim`, {}).catch(() => {}); // 미지정이면 담당 먼저
      await api.post(`/qna/posts/${q.id}/answers`, { body: ansText.trim() });
      setMsg('답변을 등록했어요.'); setAnsFor(null); setAnsText(''); load();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : '답변 실패'); } finally { setBusy(null); }
  }
  async function readNoti(id: string) { setD((p) => p && { ...p, notifications: p.notifications.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)) }); await api.patch(`/notifications/${id}/read`, {}).catch(() => {}); }

  if (d === null) return <div><PageHeader title="인박스" sub="상담신청·질문·미확인 채팅·알림을 한곳에서." /><Spinner /></div>;
  const show = (f: Filter) => filter === 'all' || filter === f;
  const chips: { k: Filter; label: string; n?: number }[] = [
    { k: 'all', label: '전체' },
    { k: 'req', label: '상담신청', n: d.counts.requests },
    { k: 'q', label: '질문', n: d.counts.questions },
    { k: 'noti', label: '알림', n: d.counts.notifications },
  ];
  const unreadNotis = d.notifications.filter((n) => !n.readAt);
  const empty = (!show('req') || d.requests.length === 0) && (!show('q') || d.questions.length === 0) && (!show('noti') || unreadNotis.length === 0);

  return (
    <div>
      <PageHeader title="인박스" sub="들어온 상담신청·질문·미확인 채팅·알림을 한곳에서 처리합니다." />
      <StatGrid>
        <StatCard label="대기 상담" value={d.counts.requests} />
        <StatCard label="답변 대기 질문" value={d.counts.questions} />
        <StatCard label="새 메시지" value={d.counts.unreadChats} />
        <StatCard label="안 읽은 알림" value={d.counts.notifications} />
      </StatGrid>

      {d.counts.unreadChats > 0 && (
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '10px 0 0' }}>
          💬 미확인 채팅 {d.counts.unreadChats}건 — <Link to="/app/bookings" style={{ color: 'var(--teal)', fontWeight: 700 }}>예약에서 열기 →</Link>
        </p>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '16px 0 8px' }}>
        {chips.map((c) => (
          <button key={c.k} onClick={() => setFilter(c.k)} aria-pressed={filter === c.k}
            style={{ border: `1px solid ${filter === c.k ? 'var(--teal)' : 'var(--line)'}`, background: filter === c.k ? 'var(--teal)' : 'var(--surface)', color: filter === c.k ? '#fff' : 'var(--muted)', borderRadius: 999, padding: '5px 13px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {c.label}{c.n ? ` ${c.n}` : ''}
          </button>
        ))}
      </div>

      {msg && <p style={{ fontSize: 13, color: 'var(--teal)', margin: '4px 0' }} role="status">{msg}</p>}

      {empty && <EmptyState>새로 처리할 항목이 없어요. 👍</EmptyState>}

      {/* 상담신청 */}
      {show('req') && d.requests.map((r) => (
        <Card key={r.bookingId} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <b style={{ fontSize: 14 }}>{r.studentName}</b> <Badge kind="new">상담신청</Badge>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>{r.consultType ?? '상담'}{r.subType ? ` · ${r.subType}` : ''} · {MODE[r.mode] ?? r.mode}{r.start ? ` · ${when(r.start)}` : ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button size="sm" disabled={busy === r.bookingId} onClick={() => respond(r.bookingId, 'accept')}>수락</Button>
              <Button size="sm" variant="ghost" disabled={busy === r.bookingId} onClick={() => respond(r.bookingId, 'reject')}>거절</Button>
            </div>
          </div>
        </Card>
      ))}

      {/* 질문 */}
      {show('q') && d.questions.map((q) => (
        <Card key={q.id} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <b style={{ fontSize: 14 }}>{q.studentName}</b> <Badge kind={q.assigned ? 'confirmed' : 'soft'}>{q.assigned ? '지정 질문' : '공개 질문'}</Badge>
              <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{q.body}</div>
              <div style={{ fontSize: 11, color: 'var(--caption)', marginTop: 3 }}>{when(q.createdAt)}</div>
            </div>
            {ansFor !== q.id && <div><Button size="sm" onClick={() => { setAnsFor(q.id); setAnsText(''); }}>답변하기</Button></div>}
          </div>
          {ansFor === q.id && (
            <div style={{ marginTop: 10 }}>
              <textarea className="input" value={ansText} onChange={(e) => setAnsText(e.target.value)} placeholder="답변을 입력하세요" rows={3} style={{ width: '100%', resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
                <Button size="sm" variant="ghost" onClick={() => { setAnsFor(null); setAnsText(''); }}>취소</Button>
                <Button size="sm" disabled={busy === q.id || !ansText.trim()} onClick={() => answer(q)}>답변 등록</Button>
              </div>
            </div>
          )}
        </Card>
      ))}

      {/* 알림(안 읽음) */}
      {show('noti') && unreadNotis.map((n) => (
        <Card key={n.id} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div>
              <b style={{ fontSize: 14 }}>{n.title}</b>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>{n.body}</div>
              <div style={{ fontSize: 11, color: 'var(--caption)', marginTop: 3 }}>{when(n.createdAt)}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {n.type === 'chat_message' && n.payload?.bookingId && (
                <Link className="btn sm" to={`/app/bookings?chat=${n.payload.bookingId}`} onClick={() => void readNoti(n.id)}>💬 채팅 열기</Link>
              )}
              <Button size="sm" variant="ghost" onClick={() => readNoti(n.id)}>읽음</Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
