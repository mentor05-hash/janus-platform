import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { roleHome } from '../auth/roleHome';
import { Button, ErrorText, TextField, PasswordField } from '../components/ui';
import { APP_NAME } from '../branding.generated';
import { JanusLogo } from '../components/JanusLogo';

const DEMO_PW = 'dev-password!';
// 데모 모드에서만 로그인 편의(자동로그인·역할 원터치·기본 비번 노출) 활성. 실서비스=false.
const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';
// 역할별 대표 데모 계정 — 클릭하면 아이디·비번 자동 채움.
const ROLES = [
  { label: '선생님', id: 'teacher01' },
  { label: '센터관리자', id: 'admin01' },
  { label: '본사관리자', id: 'hq01' },
  { label: '마스터', id: 'master01' },
  { label: 'HR', id: 'hr01' },
  { label: '학생', id: 'student01' },
  { label: '유료회원', id: 'paid01' },
  { label: '학부모', id: 'guardian01' },
];

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState(DEMO ? 'teacher01' : '');
  const [password, setPassword] = useState(DEMO ? DEMO_PW : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 이미 로그인된 상태로 /login 진입(또는 로그인 직후 user 갱신) → 역할 홈으로.
  // 렌더 중 navigate 호출은 React 경고("Cannot update a component while rendering")의 원인 — effect 로 이동.
  useEffect(() => {
    if (user) navigate(roleHome(user.role), { replace: true });
  }, [user, navigate]);

  // URL ?u=아이디&p=비번 → 자동 로그인(데모 전용). 실서비스에선 비번 URL 노출 방지 위해 비활성.
  useEffect(() => {
    if (!DEMO) return;
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
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', background: 'var(--bg)', backgroundImage: 'radial-gradient(rgba(36,64,95,.08) 1px, transparent 1px)', backgroundSize: '26px 26px', padding: 16 }}>
      <form className="card" style={{ width: 360, padding: 26 }} onSubmit={onSubmit}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <JanusLogo size={34} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.01em' }}>3초면 문이 열려요</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{APP_NAME} — 진단 결과와 질문 기록을 안전하게 이어서 보려면 로그인하세요</div>
          </div>
        </div>
        {DEMO && (
          <>
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
          </>
        )}
        <TextField label="아이디" value={loginId} onChange={(e) => setLoginId(e.target.value)} />
        <PasswordField label="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} />
        {DEMO && (
          <p style={{ fontSize: 11, color: 'var(--caption)', margin: '4px 0 0' }}>
            데모 비밀번호 공통: <b>{DEMO_PW}</b> · 아이디 숫자만 바꿔 다른 계정 사용
            {' · '}<Link to="/demo" style={{ color: 'var(--blue)', fontWeight: 700 }}>회원 목록에서 고르기</Link>
          </p>
        )}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" block loading={busy} style={{ marginTop: 12 }}>
          로그인
        </Button>
        <Link to="/placement" className="btn ghost block" style={{ marginTop: 8, textDecoration: 'none', textAlign: 'center', display: 'block' }}>
          가입 없이 예시로 둘러보기
        </Link>
        <p style={{ fontSize: 12, textAlign: 'center', margin: '12px 0 0' }}>
          계정이 없으신가요? <Link to="/signup" style={{ color: 'var(--blue)', fontWeight: 700 }}>회원가입</Link>
          {' · '}<Link to="/forgot" style={{ color: 'var(--muted)' }}>비밀번호 찾기</Link>
        </p>
        <p style={{ fontSize: 11, textAlign: 'center', margin: '8px 0 0', color: 'var(--caption)', lineHeight: 1.6 }}>
          계속하면 <Link to="/terms" style={{ color: 'var(--muted)' }}>이용약관</Link>·<Link to="/privacy" style={{ color: 'var(--muted)' }}>개인정보 처리방침</Link>에 동의하게 됩니다.<br />
          성적·질문 데이터는 본인 동의 없이 공유되지 않아요.
        </p>
      </form>
    </div>
  );
}
