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

export function AppLayout() {
  const { user, logout } = useAuth();
  return (
    <div>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          background: 'var(--teal)',
          color: '#fff',
        }}
      >
        <strong>잇올 멘토링 · 선생님</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
          <span>
            {user?.name} ({user?.role})
          </span>
          <button className="btn ghost sm" onClick={logout}>
            로그아웃
          </button>
        </div>
      </header>
      <nav
        style={{
          display: 'flex',
          gap: 20,
          padding: '0 24px',
          background: '#fff',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <NavLink to="/app/bookings" style={navStyle}>
          예약
        </NavLink>
        <NavLink to="/app/schedule" style={navStyle}>
          근무·슬롯
        </NavLink>
        <NavLink to="/app/reverse" style={navStyle}>
          역상담 제안
        </NavLink>
        <NavLink to="/app/payroll" style={navStyle}>
          예상급여
        </NavLink>
      </nav>
      <main style={{ maxWidth: 920, margin: '0 auto', padding: 24 }}>
        <Outlet />
      </main>
    </div>
  );
}
