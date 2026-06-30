import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isHq } from '../auth/roleHome';

const navStyle = ({ isActive }: { isActive: boolean }) => ({
  padding: '8px 4px',
  color: isActive ? 'var(--teal)' : 'var(--muted)',
  fontWeight: isActive ? 700 : 500,
  borderBottom: isActive ? '2px solid var(--teal)' : '2px solid transparent',
  textDecoration: 'none',
  fontSize: 14,
});

export function AdminLayout() {
  const { user, logout } = useAuth();
  const hq = isHq(user);
  const scopeLabel = hq ? '본사 (전사)' : user?.role === 'hr' ? 'HR' : '센터 관리자';
  return (
    <div>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          background: hq ? '#0b3a4d' : 'var(--ink)',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <strong>잇올 멘토링 · {hq ? '본사' : '관리자'}</strong>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 999,
              background: hq ? '#d4af37' : '#3a4a52',
              color: hq ? '#16242b' : '#cfe3ec',
            }}
          >
            {scopeLabel}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
          <span>
            {user?.name} ({user?.role})
          </span>
          <button className="btn ghost sm" onClick={logout}>
            로그아웃
          </button>
        </div>
      </header>
      <nav style={{ display: 'flex', gap: 20, padding: '0 24px', background: '#fff', borderBottom: '1px solid var(--line)' }}>
        <NavLink to="/admin/dashboard" style={navStyle}>
          대시보드
        </NavLink>
        <NavLink to="/admin/students" style={navStyle}>
          학생 승인
        </NavLink>
        {user?.role === 'admin' && (
          <>
            <NavLink to="/admin/policy" style={navStyle}>
              정책 편집
            </NavLink>
            {/* 줌·상담실·차단은 센터 단위 — 본사(HQ)에는 숨김 */}
            {!hq && (
              <NavLink to="/admin/infra" style={navStyle}>
                줌·상담실·차단
              </NavLink>
            )}
            <NavLink to="/admin/reports" style={navStyle}>
              신고
            </NavLink>
            <NavLink to="/admin/announcements" style={navStyle}>
              공지
            </NavLink>
            {/* 조직 관리는 본사 이상(전사) 전용 */}
            {hq && (
              <NavLink to="/admin/org" style={navStyle}>
                조직 관리
              </NavLink>
            )}
          </>
        )}
      </nav>
      <main style={{ maxWidth: 920, margin: '0 auto', padding: 24 }}>
        <Outlet />
      </main>
    </div>
  );
}
