import { useEffect, useState } from 'react';
import { APP_NAME } from '../branding.generated';
import { JanusLogo } from './JanusLogo';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ThemeToggle } from './ThemeToggle';

const navCls = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-item active' : 'nav-item');

const NAV = [
  { to: '/student', label: '나의 관문', end: true },
  { to: '/student/diagnostic', label: '수준진단' },
  { to: '/student/search', label: '선생님 찾기' },
  { to: '/student/bookings', label: '내 예약·상담' },
  { to: '/student/scores', label: '내 성적·배치', flag: 'scores' as const, end: true },
  { to: '/student/scores/input', label: '수능 성적 입력' },
  { to: '/placement/hub', label: '배치표 허브' },
  { to: '/placement/gap', label: '격차 리포트' },
  { to: '/student/materials', label: '자료실' },
  { to: '/student/qna', label: '질문 게시판' },
  { to: '/student/community', label: '커뮤니티', end: true },
  { to: '/student/community/board', label: '커뮤니티 Q&A' },
  { to: '/student/membership', label: '멤버십·결제' },
  { to: '/student/credits', label: '크레딧' },
  { to: '/student/notifications', label: '알림' },
  { to: '/student/reverse', label: '역상담' },
  { to: '/student/auto-assign', label: '자동배정 신청' },
  { to: '/student/legal', label: '약관·개인정보' },
];

export function StudentLayout() {
  const { user, logout } = useAuth();
  const initial = (user?.name ?? '학').slice(0, 1);
  const [showScores, setShowScores] = useState(false);
  useEffect(() => { api.get<{ showTrend: boolean }>('/me/scores/access').then((a) => setShowScores(!!a.showTrend)).catch(() => setShowScores(false)); }, []);
  const nav = NAV.filter((n) => n.flag !== 'scores' || showScores);
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="sidebar-logo" style={{ textDecoration: 'none', color: 'inherit' }} title="홈(메인)으로">
          <span className="mark"><JanusLogo size={30} /></span>
          <div>
            <div className="title">{APP_NAME}</div>
            <div className="center">학생</div>
          </div>
        </Link>
        <nav className="sidebar-nav">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} className={navCls} end={'end' in n && n.end}>
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
