import { useEffect, useState } from 'react';
import { APP_NAME, LOGO_MARK } from '../branding.generated';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import type { Notification } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ThemeToggle } from './ThemeToggle';

// UX 개편(O44~O46, 2026-07-26): 1차 내비는 5그룹 고정 — 새 서비스는 그룹 서브탭·홈 카드로만 수용하고 탭을 늘리지 않는다.
// 기존 12개 라우트 URL은 전부 불변(수납만) — 북마크·딥링크 호환.
type SubItem = { to: string; label: string };
type Group = { key: string; label: string; icon: string; to: string; match: string[]; sub?: SubItem[] };

const GROUPS: Group[] = [
  { key: 'home', label: '홈', icon: '⌂', to: '/student/home', match: ['/student/home'] },
  {
    key: 'qna', label: '질문', icon: '💬', to: '/student/qna',
    match: ['/student/qna', '/student/community'],
    sub: [
      { to: '/student/qna', label: '질문 게시판' },
      { to: '/student/community', label: '커뮤니티' },
    ],
  },
  { key: 'diag', label: '진단', icon: '📈', to: '/student/scores', match: ['/student/scores'] },
  {
    key: 'sched', label: '일정', icon: '📅', to: '/student/bookings',
    match: ['/student/bookings', '/student/search', '/student/auto-assign'],
    sub: [
      { to: '/student/bookings', label: '내 예약·상담' },
      { to: '/student/search', label: '선생님 찾기' },
      { to: '/student/auto-assign', label: '자동배정 신청' },
    ],
  },
  {
    key: 'me', label: '내정보', icon: '👤', to: '/student/membership',
    match: ['/student/membership', '/student/credits', '/student/materials', '/student/reverse', '/student/legal', '/student/notifications'],
    sub: [
      { to: '/student/membership', label: '멤버십·결제' },
      { to: '/student/credits', label: '크레딧' },
      { to: '/student/materials', label: '자료실' },
      { to: '/student/reverse', label: '역상담' },
      { to: '/student/legal', label: '약관·개인정보' },
    ],
  },
];

const subCls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');

export function StudentLayout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const initial = (user?.name ?? '학').slice(0, 1);
  const active = GROUPS.find((g) => g.match.some((m) => pathname.startsWith(m)));

  // 알림은 1차 내비가 아니라 상단 벨(+미확인 배지)로 — SNS 문법.
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api.get<Notification[]>('/notifications')
        .then((r) => { if (alive) setUnread((Array.isArray(r) ? r : []).filter((n) => !n.read_at).length); })
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [pathname]);

  const bell = (
    <Link to="/student/notifications" className="bell" aria-label={`알림${unread ? ` — 미확인 ${unread}건` : ''}`}>
      🔔
      {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
    </Link>
  );

  return (
    <div className="shell with-tabs">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="mark">{LOGO_MARK}</span>
          <div>
            <div className="title">{APP_NAME}</div>
            <div className="center">학생</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {GROUPS.map((g) => (
            <Link key={g.key} to={g.to} className={active?.key === g.key ? 'nav-item active' : 'nav-item'}>
              <span className="ic" aria-hidden>{g.icon}</span>
              {g.label}
            </Link>
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
        <div className="topbar">
          <Link to="/student/home" className="m-logo">
            <span className="mark">{LOGO_MARK}</span>
            <span>{APP_NAME}</span>
          </Link>
          <div className="topbar-right">
            <span className="m-only"><ThemeToggle compact /></span>
            {bell}
            <button className="btn ghost sm m-only" onClick={logout}>로그아웃</button>
          </div>
        </div>
        {active?.sub && (
          <nav className="subnav" aria-label={`${active.label} 하위 메뉴`}>
            {active.sub.map((s) => (
              <NavLink key={s.to} to={s.to} className={subCls}>{s.label}</NavLink>
            ))}
          </nav>
        )}
        <div className="inner">
          <Outlet />
        </div>
      </main>

      <nav className="m-tabbar" aria-label="주요 메뉴">
        {GROUPS.map((g) => (
          <Link key={g.key} to={g.to} className={active?.key === g.key ? 'active' : ''}>
            <span className="ic" aria-hidden>{g.icon}</span>
            {g.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
