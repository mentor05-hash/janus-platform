import { NavLink, Outlet } from 'react-router-dom';
import { APP_NAME, LOGO_MARK } from '../branding.generated';
import { useAuth } from '../auth/AuthContext';
import { ThemeToggle } from './ThemeToggle';

const navCls = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-item active' : 'nav-item');

// UX 개편(2026-07-26): 공급자 콘솔은 항목 삭제 없이 그룹 수납만 — 큐 처리 밀도 유지.
const SECTIONS = [
  {
    label: '오늘',
    items: [
      { to: '/app/dashboard', label: '대시보드' },
      { to: '/app/inbox', label: '인박스' },
      { to: '/app/bookings', label: '예약' },
      { to: '/app/schedule', label: '근무·슬롯' },
    ],
  },
  {
    label: '수업',
    items: [
      { to: '/app/classes', label: '강의실' },
      { to: '/app/materials', label: '자료실' },
      { to: '/app/records', label: '상담 기록' },
    ],
  },
  {
    label: '답변·평가',
    items: [
      { to: '/app/qna', label: '질문 답변' },
      { to: '/app/evaluations', label: '받은 평가' },
      { to: '/app/reverse', label: '역상담 제안' },
    ],
  },
  {
    label: '정산·계정',
    items: [
      { to: '/app/payroll', label: '예상급여' },
      { to: '/app/profile', label: '내 프로필' },
      { to: '/app/notifications', label: '알림' },
      { to: '/app/legal', label: '약관·개인정보' },
    ],
  },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const initial = (user?.name ?? '선').slice(0, 1);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="mark">{LOGO_MARK}</span>
          <div>
            <div className="title">{APP_NAME}</div>
            <div className="center">선생님 콘솔</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {SECTIONS.map((s) => (
            <div key={s.label}>
              <div className="nav-sec">{s.label}</div>
              {s.items.map((n) => (
                <NavLink key={n.to} to={n.to} className={navCls}>
                  {n.label}
                </NavLink>
              ))}
            </div>
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
