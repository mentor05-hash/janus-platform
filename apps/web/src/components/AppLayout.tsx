import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const navCls = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-item active' : 'nav-item');

const NAV = [
  { to: '/app/bookings', label: '예약' },
  { to: '/app/schedule', label: '근무·슬롯' },
  { to: '/app/reverse', label: '역상담 제안' },
  { to: '/app/payroll', label: '예상급여' },
  { to: '/app/materials', label: '자료실' },
  { to: '/app/notifications', label: '알림' },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const initial = (user?.name ?? '선').slice(0, 1);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="mark">잇</span>
          <div>
            <div className="title">잇올 멘토링</div>
            <div className="center">선생님 콘솔</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={navCls}>
              {n.label}
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
      </aside>
      <main className="shell-main">
        <div className="inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
