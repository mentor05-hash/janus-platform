/* 학부모 레이아웃 — bbf7fb3(리포트 v1)에서 학부모 홈이 독립 페이지가 되며 내비게이션이 사라진 회귀 복원.
 * 이전(구 /app 진입)의 선생님용 탭은 학부모에게 부적합했으므로, 학부모 전용 탭으로 재구성한다. */
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { JanusLogo } from './JanusLogo';
import { APP_NAME } from '../branding.generated';

const navCls = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-item active' : 'nav-item');

const NAV = [
  { to: '/guardian/report', label: '주간 리포트' },
  { to: '/guardian/pay', label: '결제·충전' },
  { to: '/guardian/community', label: '커뮤니티 Q&A' },
  { to: '/guardian/notifications', label: '알림' },
];

export function GuardianLayout() {
  const { user, logout } = useAuth();
  const initial = (user?.name ?? '보').slice(0, 1);
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
            <div className="center">학부모</div>
          </div>
        </Link>
        <nav className="sidebar-nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={navCls}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {n.label}
                {n.to === '/guardian/notifications' && unread > 0 && (
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
            <div className="role">학부모</div>
          </div>
          <button className="btn ghost sm logout" onClick={logout}>로그아웃</button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
