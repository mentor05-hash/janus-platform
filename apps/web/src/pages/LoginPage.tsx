import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { roleHome } from '../auth/roleHome';
import { Button, ErrorText, TextField, PasswordField } from '../components/ui';

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('teacher01');
  const [password, setPassword] = useState('dev-password!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) navigate(roleHome(user.role), { replace: true });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const me = await login(loginId, password);
      navigate(roleHome(me.role), { replace: true });
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
        <TextField label="아이디" value={loginId} onChange={(e) => setLoginId(e.target.value)} />
        <PasswordField label="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" block loading={busy} style={{ marginTop: 12 }}>
          로그인
        </Button>
      </form>
    </div>
  );
}
