import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { APP_NAME } from '../branding.generated';
import { JanusLogo } from './JanusLogo';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ThemeToggle } from './ThemeToggle';

const navCls = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-item active' : 'nav-item');

const NAV = [
  { to: '/app/dashboard', label: '대시보드' },
  { to: '/app/inbox', label: '인박스' },
  { to: '/app/profile', label: '내 프로필' },
  { to: '/app/bookings', label: '예약' },
  { to: '/app/schedule', label: '근무·슬롯' },
  { to: '/app/evaluations', label: '받은 평가' },
  { to: '/app/reverse', label: '역상담 제안' },
  { to: '/app/qna', label: '질문 답변' },
  { to: '/app/community', label: '커뮤니티 Q&A' },
  { to: '/app/placement/hub', label: '배치표 허브' },
  { to: '/app/payroll', label: '예상급여' },
  { to: '/app/materials', label: '자료실' },
  { to: '/app/lectures', label: '내 강좌' },
  { to: '/app/classes', label: '강의실' },
  { to: '/app/records', label: '상담 기록' },
  { to: '/app/reports', label: '상담 리포트' },
  { to: '/app/notifications', label: '알림' },
  { to: '/app/legal', label: '약관·개인정보' },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const initial = (user?.name ?? '선').slice(0, 1);
  const loc = useLocation();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    api.get<Array<{ read_at: string | null }>>('/notifications')
      .then((r) => setUnread((Array.isArray(r) ? r : []).filter((n) => !n.read_at).length))
      .catch(() => { /* 무시 */ });
  }, [loc.pathname]);
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
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={navCls}
              onClick={() => { if (window.location.pathname === n.to) window.dispatchEvent(new CustomEvent('janus:refresh')); }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {n.label}
                {n.to === '/app/notifications' && unread > 0 && (
                  <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--danger, #dc2626)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </span>
            </NavLink>
          ))}
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
