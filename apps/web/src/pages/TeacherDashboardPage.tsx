import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Booking, MyEvaluations, Notification, Payroll } from '../api/types';
import { PageHeader, Card, Spinner, Badge, GradeBadge, EmptyState } from '../components/ui';
import { StatCard, StatGrid, BarList } from '../components/dashboard/widgets';

const won = (n: number) => `${n.toLocaleString()}원`;
const todayKst = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
const dayOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }) : '');
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }) : '-');

const STATUS_LABEL: Record<string, string> = { new: '대기', confirmed: '예약됨', done: '완료', cancelled: '취소', rejected: '거절', noshow: '노쇼' };
const badgeKind = (s: string) => (['new', 'confirmed', 'done', 'cancelled', 'rejected', 'noshow'].includes(s) ? s : 'soft') as 'new';

export function TeacherDashboardPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [evalv, setEvalv] = useState<MyEvaluations | null>(null);
  const [payroll, setPayroll] = useState<Payroll | null>(null);
  const [notis, setNotis] = useState<Notification[]>([]);
  const [reverseCount, setReverseCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    api.get<Booking[]>('/bookings?role=teacher').then(setBookings).catch(() => setBookings([]));
    api.get<MyEvaluations>('/me/evaluations').then(setEvalv).catch(() => {});
    api.get<Payroll>(`/teachers/${user.id}/payroll`).then(setPayroll).catch(() => {});
    api.get<Notification[]>('/notifications').then((r) => setNotis(Array.isArray(r) ? r : [])).catch(() => {});
    api.get<{ studentId: string }[]>('/bookings/reverse/eligible').then((r) => setReverseCount(r.length)).catch(() => {});
  }, [user]);

  const today = todayKst();
  const all = bookings ?? [];
  const todays = all.filter((b) => dayOf(b.start) === today && b.status !== 'cancelled' && b.status !== 'rejected').sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  const upcoming = all.filter((b) => (b.status === 'confirmed' || b.status === 'new') && (b.start ?? '') > new Date().toISOString());
  const doneCount = all.filter((b) => b.status === 'done').length;
  const unread = notis.filter((n) => !n.read_at).length;

  return (
    <div>
      <PageHeader title={`${user?.name ?? '선생님'} 대시보드`} sub="오늘 일정과 주요 지표를 한눈에 확인합니다." />

      <StatGrid>
        <StatCard label="오늘 예약" value={bookings === null ? '…' : `${todays.length}건`} tone="teal" />
        <StatCard label="다가오는 예약" value={bookings === null ? '…' : `${upcoming.length}건`} tone="teal" />
        <StatCard label="받은 평가" value={evalv ? <span><GradeBadge grade={evalv.grade} /> {evalv.overall.toFixed(1)}</span> : '—'} />
        <StatCard label="예상 급여" value={payroll ? won(payroll.expectedAmount) : '—'} tone="teal" />
        <StatCard label="미확인 알림" value={`${unread}건`} />
      </StatGrid>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 16 }}>
        {/* 오늘의 예약 */}
        <Card title="오늘의 예약" style={{ flex: '1 1 460px', minWidth: 340 }}>
          {bookings === null ? <Spinner /> : todays.length === 0 ? <EmptyState>오늘 예약이 없습니다.</EmptyState> : (
            todays.map((b) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <b>{hhmm(b.start)}~{hhmm(b.end)}</b>
                  <span style={{ color: 'var(--muted)', fontSize: 13, marginLeft: 8 }}>{b.consultType ?? ''} · {b.mode}</span>
                  {b.direction === 'reverse' && <Badge kind="soft">역상담</Badge>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Badge kind={badgeKind(b.status)}>{STATUS_LABEL[b.status] ?? b.status}</Badge>
                  <Link to={`/app/bookings/${b.id}/note`} className="btn ghost sm">상담 기록</Link>
                </div>
              </div>
            ))
          )}
          <div style={{ marginTop: 10 }}><Link to="/app/bookings" style={{ color: 'var(--teal)', fontSize: 13 }}>전체 예약 보기 →</Link></div>
        </Card>

        {/* 받은 평가 */}
        <Card title="받은 평가" style={{ flex: '1 1 320px', minWidth: 280 }}>
          {!evalv ? <EmptyState>평가 데이터 없음</EmptyState> : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <GradeBadge grade={evalv.grade} />
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--teal)' }}>{evalv.overall.toFixed(1)}</div>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>리뷰 {evalv.count}건{evalv.topPercent != null ? ` · 상위 ${evalv.topPercent}%` : ''}</div>
              </div>
              <BarList items={[
                { id: 'attitude', label: '태도', value: Math.round(evalv.itemScores.attitude * 20) },
                { id: 'content', label: '내용', value: Math.round(evalv.itemScores.content * 20) },
                { id: 'skill', label: '실력', value: Math.round(evalv.itemScores.skill * 20) },
                { id: 'again', label: '재신청', value: Math.round(evalv.itemScores.again * 20) },
              ]} max={100} suffix="%" />
              <div style={{ marginTop: 10 }}><Link to="/app/evaluations" style={{ color: 'var(--teal)', fontSize: 13 }}>평가 상세 →</Link></div>
            </>
          )}
        </Card>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 16 }}>
        {/* 바로가기 / 역상담 */}
        <Card title="바로가기" style={{ flex: '1 1 320px', minWidth: 280 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link to="/app/reverse" className="btn ghost">역상담 제안 {reverseCount != null && <Badge kind="new">{reverseCount}</Badge>}</Link>
            <Link to="/app/schedule" className="btn ghost">근무·슬롯 관리</Link>
            <Link to="/app/payroll" className="btn ghost">예상 급여 {payroll && `· ${won(payroll.expectedAmount)}`}</Link>
            <Link to="/app/materials" className="btn ghost">자료실</Link>
          </div>
        </Card>

        {/* 최근 알림 */}
        <Card title={`최근 알림 ${unread > 0 ? `(미확인 ${unread})` : ''}`} style={{ flex: '1 1 460px', minWidth: 340 }}>
          {notis.length === 0 ? <EmptyState>알림이 없습니다.</EmptyState> : (
            notis.slice(0, 6).map((n) => (
              <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: 13, color: n.read_at ? 'var(--muted)' : 'var(--ink)' }}>
                  {!n.read_at && <span style={{ color: 'var(--teal)' }}>● </span>}{n.type ?? '알림'} {typeof n.payload?.message === 'string' ? `· ${n.payload.message}` : ''}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{n.created_at ? new Date(n.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' }) : ''}</span>
              </div>
            ))
          )}
          <div style={{ marginTop: 10 }}><Link to="/app/notifications" style={{ color: 'var(--teal)', fontSize: 13 }}>알림 전체 →</Link></div>
        </Card>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 14 }}>완료 상담 누적 {doneCount}건</p>
    </div>
  );
}
