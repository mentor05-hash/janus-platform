import { Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

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
      <main style={{ maxWidth: 920, margin: '0 auto', padding: 24 }}>
        <Outlet />
      </main>
    </div>
  );
}
