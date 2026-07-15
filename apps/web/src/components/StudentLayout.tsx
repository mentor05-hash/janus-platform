import { useEffect, useState } from 'react';
import { APP_NAME } from '../branding.generated';
import { JanusLogo } from './JanusLogo';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ThemeToggle } from './ThemeToggle';

const navCls = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-item active' : 'nav-item');

type NavItem = { to: string; label: string; end?: boolean; flag?: 'scores' } | { section: string };
const NAV: NavItem[] = [
  { to: '/student', label: '나의 관문', end: true },
  { section: '진단' },
  { to: '/student/diagnostic', label: '실력진단' },
  { to: '/student/scores/input', label: '성적진단' },
  { to: '/student/curriculum', label: '학습 플랜' },
  { section: '배치·성적' },
  { to: '/student/placement/hub', label: '배치표 허브' },
  { to: '/student/placement/gap', label: '격차 리포트' },
  { to: '/student/scores', label: '내 성적·배치', flag: 'scores', end: true },
  { section: '학습·상담' },
  { to: '/student/lectures', label: '강좌' },
  { to: '/student/search', label: '선생님 찾기' },
  { to: '/student/bookings', label: '내 예약·상담' },
  { to: '/student/materials', label: '자료실' },
  { to: '/student/qna', label: '질문 게시판' },
  { to: '/student/community', label: '커뮤니티', end: true },
  { to: '/student/community/board', label: '커뮤니티 Q&A' },
  { to: '/student/league', label: '리그 리더보드' },
  { section: '내 계정' },
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
  // 알림 미읽음 뱃지 — 마운트 + 라우트 이동 시 갱신(읽고 나오면 줄어듦).
  const loc = useLocation();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    api.get<Array<{ read_at: string | null }>>('/notifications')
      .then((r) => setUnread((Array.isArray(r) ? r : []).filter((n) => !n.read_at).length))
      .catch(() => { /* 무시 */ });
  }, [loc.pathname]);
  const nav = NAV.filter((n) => !('flag' in n) || n.flag !== 'scores' || showScores);
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
          {nav.map((n) => ('section' in n ? (
            <div key={`sec-${n.section}`} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', color: 'var(--caption)', padding: '14px 16px 4px', textTransform: 'none' }}>
              {n.section}
            </div>
          ) : (
            <NavLink key={n.to} to={n.to} className={navCls} end={'end' in n && n.end}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {n.label}
                {n.to === '/student/notifications' && unread > 0 && (
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
