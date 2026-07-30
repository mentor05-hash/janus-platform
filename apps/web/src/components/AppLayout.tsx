import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { APP_NAME } from '../branding.generated';
import { JanusLogo } from './JanusLogo';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import { TEACHER_NAV, isGroup, isSub } from '@mentoring/nav';
import { NavGroupHeading, NavSubHeading } from './NavHeading';

const navCls = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-item active' : 'nav-item');


export function AppLayout() {
  const { user, logout } = useAuth();
  const initial = (user?.name ?? '선').slice(0, 1);
  const loc = useLocation();
  const [unread, setUnread] = useState(0);
  // 인지 개선 ① — 예약 탭 뱃지: 수락 대기 신청 수 + 1시간 내 임박 상담 강조.
  const [att, setAtt] = useState<{ pending: number; imminentAt: string | null }>({ pending: 0, imminentAt: null });
  const loadAtt = () => api.get<{ pending: number; imminentAt: string | null }>('/bookings/attention').then(setAtt).catch(() => { /* 무시 */ });
  // Q&A 대기 배지 — 공개 큐 미클레임 + 내가 맡은 미답변(qna_pool_new 실시간 신호로 즉시 갱신).
  const [qnaAtt, setQnaAtt] = useState<{ pool: number; mine: number; total: number }>({ pool: 0, mine: 0, total: 0 });
  const loadQnaAtt = () => api.get<{ pool: number; mine: number; total: number }>('/qna/attention').then(setQnaAtt).catch(() => { /* 무시 */ });
  // 채팅 탭 배지 — 미확인 메시지 총합
  const [chatUnread, setChatUnread] = useState(0);
  const loadChatUnread = () => api.get<Record<string, number>>('/chat/unread').then((u) => setChatUnread(Object.values(u).reduce((a, b) => a + b, 0))).catch(() => { /* 무시 */ });
  useEffect(() => {
    api.get<Array<{ read_at: string | null }>>('/notifications')
      .then((r) => setUnread((Array.isArray(r) ? r : []).filter((n) => !n.read_at).length))
      .catch(() => { /* 무시 */ });
    loadAtt();
    loadQnaAtt();
    loadChatUnread();
  }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const iv = setInterval(() => { loadAtt(); loadQnaAtt(); }, 60_000); // 임박 상담은 시간 경과로도 상태가 바뀜 — 1분 주기 갱신
    const h = (e: Event) => {
      const t = (e as CustomEvent<{ type?: string }>).detail?.type ?? '';
      if (t.startsWith('booking_')) loadAtt();
      if (t.startsWith('qna_')) loadQnaAtt();
      if (t === 'chat_message') loadChatUnread();
    };
    window.addEventListener('janus:notif', h);
    return () => { clearInterval(iv); window.removeEventListener('janus:notif', h); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const immLabel = att.imminentAt ? new Date(att.imminentAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }) : null;
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="sidebar-logo" style={{ textDecoration: 'none', color: 'inherit' }} title="홈(메인)으로">
          <span className="mark"><JanusLogo size={30} /></span>
          <div>
            <div className="title">{APP_NAME}</div>
            <div className="center">선생님 콘솔</div>
          </div>
        </Link>
        <nav className="sidebar-nav">
          {TEACHER_NAV.map((n, i) => (isGroup(n) ? (
            <NavGroupHeading key={`grp-${n.group}`} label={n.group} first={i === 0} />
          ) : isSub(n) ? (
            <NavSubHeading key={`sub-${n.sub}`} label={n.sub} />
          ) : (
            <NavLink key={n.to} to={n.to} className={navCls}
              onClick={() => { if (window.location.pathname === n.to) window.dispatchEvent(new CustomEvent('janus:refresh')); }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, ...(n.to === '/app/bookings' && immLabel ? { background: '#FEE2E2', borderRadius: 8, padding: '2px 8px', margin: '-2px -8px' } : {}) }}>
                {n.label}
                {/* 1시간 내 임박 상담 — 붉은 강조 + 시작 시각 */}
                {n.to === '/app/bookings' && immLabel && (
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#dc2626' }}>🔴 {immLabel} 상담</span>
                )}
                {/* 수락 대기 신청 수 */}
                {n.to === '/app/bookings' && att.pending > 0 && (
                  <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--danger, #dc2626)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {att.pending > 99 ? '99+' : att.pending}
                  </span>
                )}
                {/* Q&A 대기 — 공개 큐(NEW)·내가 맡은 미답변 수 */}
                {n.to === '/app/qna' && qnaAtt.total > 0 && (
                  <span title={`공개 큐 ${qnaAtt.pool}건 · 내가 맡은 미답변 ${qnaAtt.mine}건`}
                    style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--danger, #dc2626)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {qnaAtt.total > 99 ? '99+' : qnaAtt.total}
                  </span>
                )}
                {n.to === '/app/chats' && chatUnread > 0 && (
                  <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--danger, #dc2626)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {chatUnread > 99 ? '99+' : chatUnread}
                  </span>
                )}
                {n.to === '/app/notifications' && unread > 0 && (
                  <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--danger, #dc2626)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </span>
            </NavLink>
          )))}
        </nav>
        <div className="sidebar-foot">
          <span className="avatar">{initial}</span>
          <div>
            <div className="who">{user?.name}</div>
            <div className="role">{user?.role}</div>
          </div>
          <button className="btn ghost sm logout" onClick={logout}>
            로그아웃
          </button>
        </div>
        <div style={{ padding: '0 16px 14px' }}><ThemeToggle /></div>
      </aside>
      <main className="shell-main">
        <div className="inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
