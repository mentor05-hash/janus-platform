import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Booking, WorkSchedule } from '../api/types';
import { PageHeader, Button, Badge, Spinner, ErrorText, Table, Tabs } from '../components/ui';
import { SessionChatPanel } from '../components/SessionChatPanel';
import { SessionWhiteboardPanel } from '../components/SessionWhiteboardPanel';
import type { Column } from '../components/ui';
import { StatCard, StatGrid } from '../components/dashboard/widgets';
import { isSameDay, inThisWeek } from '../utils/schedule';

const STATUS_LABEL: Record<string, string> = {
  new: '신규', confirmed: '예약됨', done: '완료', cancelled: '취소', rejected: '거절', noshow: '노쇼',
};
const timeOf = (s: string | null) => (s ? new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '미정');

const TABS = [{ value: 'today', label: '오늘' }, { value: 'week', label: '이번 주' }, { value: 'all', label: '전체' }];

export function TeacherBookingsPage() {
  const { user } = useAuth();
  const teacherId = user!.id;
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [todayHours, setTodayHours] = useState(0);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatOn, setChatOn] = useState(false);
  const [wbId, setWbId] = useState<string | null>(null);
  const [wbOn, setWbOn] = useState(false);
  const [tab, setTab] = useState('today');
  const [unread, setUnread] = useState<Record<string, number>>({}); // 예약별 미확인 채팅 수
  const loadUnread = useCallback(() => { api.get<Record<string, number>>('/chat/unread').then(setUnread).catch(() => { /* 무시 */ }); }, []);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bks, ws] = await Promise.all([
        api.get<Booking[]>('/bookings?role=teacher'),
        api.get<WorkSchedule>(`/teachers/${teacherId}/work-schedule`).catch(() => null),
      ]);
      setBookings(bks);
      api.get<{ chat: boolean; whiteboard: boolean }>('/realtime/features').then((f) => { setChatOn(!!f.chat); setWbOn(!!f.whiteboard); }).catch(() => {});
      // 오늘 근무 시간 합계
      const wd = String(new Date().getDay());
      const wins = (ws?.recurring_template as Record<string, { start: string; end: string }[]> | undefined)?.[wd] ?? [];
      const hrs = wins.reduce((a, w) => a + (Number(w.end.slice(0, 2)) + Number(w.end.slice(3, 5)) / 60 - Number(w.start.slice(0, 2)) - Number(w.start.slice(3, 5)) / 60), 0);
      setTodayHours(Math.round(hrs * 10) / 10);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => { void load(); loadUnread(); }, [load, loadUnread]);
  // 알림에서 '채팅 열기'로 진입(?chat=) — 해당 예약 채팅 자동 오픈.
  const loc = useLocation();
  useEffect(() => {
    const cid = new URLSearchParams(loc.search).get('chat');
    if (cid) setChatId(cid);
  }, [loc.search]);
  // 실시간 갱신 — 신규 예약(질문승격·자동배정 포함)·새 채팅 알림·탭 재클릭 시 리로드.
  useEffect(() => {
    const h = (e: Event) => {
      const t = (e as CustomEvent<{ type?: string }>).detail?.type ?? '';
      if (t.startsWith('booking_')) void load();
      if (t === 'chat_message') loadUnread();
    };
    const r = () => { void load(); loadUnread(); };
    window.addEventListener('janus:notif', h);
    window.addEventListener('janus:refresh', r);
    return () => { window.removeEventListener('janus:notif', h); window.removeEventListener('janus:refresh', r); };
  }, [load, loadUnread]);

  async function act(id: string, action: string) {
    try {
      await api.patch(`/bookings/${id}/${action}`, {});
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '처리 실패');
    }
  }
  /** 상담 인지 확인(ack) — 학생에게 "선생님 확인 ✓" 알림. 미확인 종료 시 선생님 귀책 노쇼 처리되므로 필수. */
  async function ack(id: string) {
    try { await api.post(`/bookings/${id}/ack`, {}); await load(); }
    catch (e) { alert(e instanceof ApiError ? e.message : '처리 실패'); }
  }

  const counts = useMemo(() => ({
    new: bookings.filter((b) => b.status === 'new').length,
    confirmed: bookings.filter((b) => b.status === 'confirmed').length,
    done: bookings.filter((b) => b.status === 'done').length,
  }), [bookings]);

  const now = new Date();
  const rows = bookings.filter((b) => (tab === 'today' ? isSameDay(b.start, now) : tab === 'week' ? inThisWeek(b.start) : true));
  // 현재 탭에 안 보이는 미인지(ack 전) 예약 — '오늘' 탭만 보다가 내일 이후 신규 예약(질문승격 등)을 놓치는 것 방지.
  const hiddenUnacked = bookings.filter((b) => b.status === 'confirmed' && !b.teacherAckAt && !rows.some((r) => r.id === b.id)).length;

  const columns: Column<Booking>[] = [
    { key: 'time', header: '시간', render: (b) => timeOf(b.start) },
    { key: 'student', header: '학생', render: (b) => b.studentName ?? `학생 ${b.studentId.slice(0, 6)}` },
    { key: 'subject', header: '과목', render: (b) => b.consultType ?? '-' },
    { key: 'mode', header: '방식', render: (b) => <Badge kind="soft">{b.mode}</Badge> },
    { key: 'status', header: '상태', render: (b) => <Badge kind={(b.status as 'confirmed') ?? 'new'}>{STATUS_LABEL[b.status] ?? b.status}</Badge> },
    {
      key: 'action', header: '액션', align: 'right',
      render: (b) => (
        <span style={{ whiteSpace: 'nowrap', display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
          {b.status === 'new' && (
            <>
              <Button size="sm" onClick={() => act(b.id, 'accept')}>수락</Button>
              <Button size="sm" variant="ghost" onClick={() => act(b.id, 'reject')}>거절</Button>
            </>
          )}
          {b.status === 'confirmed' && (
            <>
              {/* 자동확정 예약 인지 확인 — 학생에게 "선생님 확인 ✓" 전달. 미확인 채로 종료되면 선생님 귀책 노쇼 처리 */}
              {!b.teacherAckAt && <Button size="sm" onClick={() => ack(b.id)} style={{ background: '#dc2626' }}>📌 확인했어요</Button>}
              <Button size="sm" onClick={() => act(b.id, 'complete')}>완료</Button>
              <Link className="btn ghost sm" to={`/app/bookings/${b.id}/note`}>기록</Link>
            </>
          )}
          {b.status === 'done' && <Link className="btn ghost sm" to={`/app/bookings/${b.id}/note`}>기록</Link>}
          {b.mode === 'zoom' && b.meetingUrl && b.status !== 'new' && <Button size="sm" onClick={() => window.open(b.meetingUrl!, '_blank', 'noopener')}>🎥 줌</Button>}
          {chatOn && b.status !== 'new' && (
            <Button size="sm" variant="ghost" onClick={() => setChatId(b.id)} style={{ position: 'relative' }}>
              💬{(unread[b.id] ?? 0) > 0 && (
                <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: 'var(--danger,#dc2626)', color: '#fff', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{unread[b.id]! > 99 ? '99+' : unread[b.id]}</span>
              )}
            </Button>
          )}
          {wbOn && b.status !== 'new' && <Button size="sm" variant="ghost" onClick={() => setWbId(b.id)}>🖊</Button>}
        </span>
      ),
    },
  ];

  if (loading) return <><PageHeader title="예약 관리" /><Spinner /></>;

  return (
    <div>
      <PageHeader title="예약 관리" sub="들어온 상담·질문을 확인하고 진행·완료를 처리하세요." />
      <ErrorText>{error}</ErrorText>
      <StatGrid>
        <StatCard label="확인 대기" value={counts.new} />
        <StatCard label="진행 예정" value={counts.confirmed} />
        <StatCard label="완료" value={counts.done} />
        <StatCard label="오늘 근무" value={todayHours} unit="h" />
      </StatGrid>
      <div style={{ marginTop: 16 }}>
        <Tabs items={TABS} value={tab} onChange={setTab} />
        {hiddenUnacked > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '9px 12px', margin: '10px 0 4px' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#B91C1C' }}>🆕 이 탭에 안 보이는 확인 전 예약 {hiddenUnacked}건이 있어요(다른 날짜 — 질문승격·자동배정 포함).</span>
            <button onClick={() => setTab('all')} style={{ cursor: 'pointer', border: '1px solid #B91C1C', background: '#fff', color: '#B91C1C', borderRadius: 8, padding: '4px 12px', fontSize: 12.5, fontWeight: 700 }}>전체 보기</button>
          </div>
        )}
        <Table columns={columns} rows={rows} rowKey={(b) => b.id} empty="해당 기간 예약이 없습니다." />
      </div>
      {chatId && <SessionChatPanel bookingId={chatId} myId={teacherId} title="상담 채팅" onClose={() => { setChatId(null); loadUnread(); }} />}
      {wbId && <SessionWhiteboardPanel bookingId={wbId} title="공유 화이트보드" onClose={() => setWbId(null)} />}
    </div>
  );
}
