import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('teacher01');
  const [password, setPassword] = useState('dev-password!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) navigate('/app/bookings', { replace: true });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(loginId, password);
      navigate('/app/bookings', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '로그인 실패');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
      <form className="card" style={{ width: 340 }} onSubmit={onSubmit}>
        <h2 style={{ marginTop: 0, color: 'var(--teal)' }}>잇올 멘토링 로그인</h2>
        <label className="label">아이디</label>
        <input className="input" value={loginId} onChange={(e) => setLoginId(e.target.value)} />
        <label className="label" style={{ marginTop: 12 }}>
          비밀번호
        </label>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit" disabled={busy} style={{ width: '100%', marginTop: 16 }}>
          {busy ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </div>
  );
}
