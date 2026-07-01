import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { roleHome } from '../auth/roleHome';
import { Button, ErrorText, TextField, PasswordField } from '../components/ui';

const DEMO_PW = 'dev-password!';
// 역할별 대표 데모 계정 — 클릭하면 아이디·비번 자동 채움.
const ROLES = [
  { label: '선생님', id: 'teacher01' },
  { label: '센터관리자', id: 'admin01' },
  { label: '본사관리자', id: 'hqadmin' },
  { label: 'HR', id: 'hr01' },
  { label: '학생', id: 'student01' },
];

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('teacher01');
  const [password, setPassword] = useState(DEMO_PW);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) navigate(roleHome(user.role), { replace: true });

  // URL ?u=아이디&p=비번 → 자동 로그인(데모 편의). 예: /login?u=admin01&p=dev-password!
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const u = q.get('u');
    const p = q.get('p');
    if (!u || !p) return;
    setLoginId(u);
    setPassword(p);
    (async () => {
      setBusy(true);
      try {
        const me = await login(u, p);
        navigate(roleHome(me.role), { replace: true });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : '자동 로그인 실패');
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <h2 style={{ marginTop: 0, color: 'var(--teal)' }}>멘토링 플랫폼 로그인</h2>
        <label className="label" style={{ marginBottom: 6 }}>역할 선택(원터치 채움)</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {ROLES.map((r) => {
            const on = loginId === r.id;
            return (
              <button type="button" key={r.id} onClick={() => { setLoginId(r.id); setPassword(DEMO_PW); setError(''); }} style={{
                cursor: 'pointer', padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                border: on ? '1px solid var(--teal)' : '1px solid var(--line)',
                background: on ? 'var(--teal)' : 'var(--surface)', color: on ? '#fff' : 'var(--muted)',
              }}>{r.label}</button>
            );
          })}
        </div>
        <TextField label="아이디" value={loginId} onChange={(e) => setLoginId(e.target.value)} />
        <PasswordField label="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} />
        <p style={{ fontSize: 11, color: 'var(--caption)', margin: '4px 0 0' }}>데모 비밀번호 공통: <b>{DEMO_PW}</b> · 아이디 숫자만 바꿔 다른 계정 사용</p>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" block loading={busy} style={{ marginTop: 12 }}>
          로그인
        </Button>
        <p style={{ fontSize: 12, textAlign: 'center', margin: '12px 0 0' }}>
          계정이 없으신가요? <Link to="/signup" style={{ color: 'var(--teal)', fontWeight: 700 }}>회원가입</Link>
          {' · '}<Link to="/forgot" style={{ color: 'var(--muted)' }}>비밀번호 찾기</Link>
        </p>
        <p style={{ fontSize: 11, textAlign: 'center', margin: '8px 0 0', color: 'var(--caption)' }}>
          <Link to="/terms" style={{ color: 'var(--muted)' }}>이용약관</Link>
          {' · '}
          <Link to="/privacy" style={{ color: 'var(--muted)' }}>개인정보처리방침</Link>
        </p>
      </form>
    </div>
  );
}
