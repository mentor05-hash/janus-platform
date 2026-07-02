import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Booking, WorkSchedule } from '../api/types';
import { PageHeader, Button, Badge, Spinner, ErrorText, Table, Tabs } from '../components/ui';
import { ChatPanel } from '../components/ChatPanel';
import { WhiteboardPanel } from '../components/WhiteboardPanel';
import type { Column } from '../components/ui';
import { StatCard, StatGrid } from '../components/dashboard/widgets';

const STATUS_LABEL: Record<string, string> = {
  new: '신규', confirmed: '예약됨', done: '완료', cancelled: '취소', rejected: '거절', noshow: '노쇼',
};
const timeOf = (s: string | null) => (s ? new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '미정');
const isSameDay = (s: string | null, ref: Date) => !!s && new Date(s).toDateString() === ref.toDateString();
const inThisWeek = (s: string | null) => {
  if (!s) return false;
  const d = new Date(s), now = new Date();
  const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 7);
  return d >= mon && d < sun;
};

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

  useEffect(() => { void load(); }, [load]);

  async function act(id: string, action: string) {
    try {
      await api.patch(`/bookings/${id}/${action}`, {});
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '처리 실패');
    }
  }

  const counts = useMemo(() => ({
    new: bookings.filter((b) => b.status === 'new').length,
    confirmed: bookings.filter((b) => b.status === 'confirmed').length,
    done: bookings.filter((b) => b.status === 'done').length,
  }), [bookings]);

  const now = new Date();
  const rows = bookings.filter((b) => (tab === 'today' ? isSameDay(b.start, now) : tab === 'week' ? inThisWeek(b.start) : true));

  const columns: Column<Booking>[] = [
    { key: 'time', header: '시간', render: (b) => timeOf(b.start) },
    { key: 'student', header: '학생', render: (b) => `학생 ${b.studentId.slice(0, 6)}` },
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
              <Button size="sm" onClick={() => act(b.id, 'complete')}>완료</Button>
              <Link className="btn ghost sm" to={`/app/bookings/${b.id}/note`}>기록</Link>
            </>
          )}
          {b.status === 'done' && <Link className="btn ghost sm" to={`/app/bookings/${b.id}/note`}>기록</Link>}
          {chatOn && b.status !== 'new' && <Button size="sm" variant="ghost" onClick={() => setChatId(b.id)}>💬</Button>}
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
        <Table columns={columns} rows={rows} rowKey={(b) => b.id} empty="해당 기간 예약이 없습니다." />
      </div>
      {chatId && <ChatPanel bookingId={chatId} myId={teacherId} title="상담 채팅" onClose={() => setChatId(null)} />}
      {wbId && <WhiteboardPanel bookingId={wbId} title="공유 화이트보드" onClose={() => setWbId(null)} />}
    </div>
  );
}
