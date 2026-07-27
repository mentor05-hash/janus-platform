import { Link, NavLink, Outlet } from 'react-router-dom';
import { APP_NAME } from '../branding.generated';
import { JanusLogo } from './JanusLogo';
import { useAuth } from '../auth/AuthContext';
import { isHq } from '../auth/roleHome';
import { visibleAdminNav } from '../auth/adminRoutes';
import { ThemeToggle } from './ThemeToggle';

const navCls = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-item active' : 'nav-item');

export function AdminLayout() {
  const { user, logout } = useAuth();
  const hq = isHq(user);
  const isMaster = user?.permLevel === 'L1';
  // 메뉴는 ADMIN_ROUTES 에서 생성한다 — 라우트 가드와 **같은 표·같은 판정 함수**를 쓰므로
  // '메뉴엔 없는데 URL 로는 열리는' 상태(N36)가 구조적으로 생기지 않는다.
  const nav = visibleAdminNav(user);
  // 권한레벨 정확 표기: 마스터/본사관리자/센터관리자 (HR 은 별도)
  const scopeLabel = user?.role === 'hr' ? 'HR' : (user?.adminTier ?? (hq ? '본사관리자' : '센터관리자'));
  const initial = (user?.name ?? '관').slice(0, 1);

  return (
    <div className="shell">
      <aside className="sidebar navy">
        <Link to="/" className="sidebar-logo" style={{ textDecoration: 'none', color: 'inherit' }} title="홈(메인)으로">
          <span className="mark"><JanusLogo size={30} /></span>
          <div>
            <div className="title">{APP_NAME}</div>
            <div className="center">{isMaster ? '마스터' : hq ? '본사' : '관리자'} · {scopeLabel}</div>
          </div>
        </Link>
        <nav className="sidebar-nav">
          {nav.map((r) => (
            <NavLink key={r.path} to={`/admin/${r.path}`} className={navCls}>{r.label}</NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="avatar">{initial}</span>
          <div>
            <div className="who">{user?.name}{user?.login_id ? ` · ${user.login_id}` : ''}</div>
            <div className="role">{scopeLabel}</div>
          </div>
          <button className="btn ghost sm logout" onClick={logout}>로그아웃</button>
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
