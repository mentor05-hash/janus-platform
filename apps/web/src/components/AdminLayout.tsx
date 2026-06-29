import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

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
  return (
    <div>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          background: 'var(--ink)',
          color: '#fff',
        }}
      >
        <strong>잇올 멘토링 · 관리자</strong>
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
            <NavLink to="/admin/infra" style={navStyle}>
              줌·상담실·차단
            </NavLink>
            <NavLink to="/admin/reports" style={navStyle}>
              신고
            </NavLink>
          </>
        )}
      </nav>
      <main style={{ maxWidth: 920, margin: '0 auto', padding: 24 }}>
        <Outlet />
      </main>
    </div>
  );
}
