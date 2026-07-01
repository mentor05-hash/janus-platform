import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const navCls = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-item active' : 'nav-item');

const NAV = [
  { to: '/student/search', label: '선생님 찾기' },
  { to: '/student/bookings', label: '내 예약·상담' },
  { to: '/student/qna', label: '질문 게시판' },
  { to: '/student/membership', label: '멤버십·결제' },
  { to: '/student/credits', label: '크레딧' },
  { to: '/student/notifications', label: '알림' },
  { to: '/student/reverse', label: '역상담' },
];

export function StudentLayout() {
  const { user, logout } = useAuth();
  const initial = (user?.name ?? '학').slice(0, 1);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="mark">잇</span>
          <div>
            <div className="title">잇올 멘토링</div>
            <div className="center">학생</div>
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
            <div className="role">학생</div>
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
