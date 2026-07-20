import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader, Card, Spinner, EmptyState, Badge } from '../components/ui';
import { SessionChatPanel } from '../components/SessionChatPanel';

/* 채팅 인박스(카톡형) — 대화가 있는 상담을 최신 메시지순으로. 미읽음 배지·미리보기·원탭 진입.
 * 선생님(/app/chats)·학생(/student/chats) 공용. '놓치지 않게' 원칙의 목록 축. */

type Row = {
  bookingId: string; counterpartId: string | null; counterpartName: string;
  mode: string | null; status: string | null; startAt: string | null;
  lastAt: string; lastPreview: string; lastMine: boolean; unread: number;
};

const MODE_ICON: Record<string, string> = { chat: '💬', zoom: '📹', hand: '✍️', offline: '🏫' };
const T = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const hm = d.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return hm;
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return '어제';
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export function ChatInboxPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<Row[]>('/chat/inbox').then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);
  // 새 채팅 알림·탭 재클릭 → 목록 갱신. 채팅 닫으면 읽음 반영 재조회.
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent<{ type?: string }>).detail?.type === 'chat_message') load(); };
    window.addEventListener('janus:notif', h);
    window.addEventListener('janus:refresh', load);
    return () => { window.removeEventListener('janus:notif', h); window.removeEventListener('janus:refresh', load); };
  }, [load]);
  // 알림 딥링크(?chat=)
  const loc = useLocation();
  useEffect(() => {
    const cid = new URLSearchParams(loc.search).get('chat');
    if (cid) setChatId(cid);
  }, [loc.search]);

  const roleLabel = user?.role === 'teacher' ? '학생' : '선생님';

  return (
    <div>
      <PageHeader title="채팅" sub={`${roleLabel}과의 상담 대화를 최신순으로 모아 봅니다. 안 읽은 대화는 배지로 표시돼요.`} />
      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <Card><EmptyState>아직 대화가 없어요 — 상담이 시작되면 여기에 모입니다.</EmptyState></Card>
      ) : (
        <Card style={{ padding: 6 }}>
          {rows.map((r) => (
            <button key={r.bookingId} onClick={() => setChatId(r.bookingId)} style={{
              display: 'flex', width: '100%', textAlign: 'left', gap: 12, alignItems: 'center', border: 'none',
              background: r.unread > 0 ? 'var(--teal-50,#EEF4FB)' : 'none', borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
            }}>
              <span style={{ fontSize: 22 }}>{MODE_ICON[r.mode ?? ''] ?? '💬'}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <b style={{ fontSize: 14 }}>{r.counterpartName} {roleLabel}</b>
                  {r.status === 'cancelled' && <Badge kind="soft">취소됨</Badge>}
                </span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.lastMine ? '나: ' : ''}{r.lastPreview || '(내용 없음)'}
                </span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--caption)' }}>{T(r.lastAt)}</span>
                {r.unread > 0 && (
                  <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--danger,#dc2626)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {r.unread > 99 ? '99+' : r.unread}
                  </span>
                )}
              </span>
            </button>
          ))}
        </Card>
      )}
      {chatId && user && <SessionChatPanel bookingId={chatId} myId={user.id} title="상담 채팅" onClose={() => { setChatId(null); load(); }} />}
    </div>
  );
}
