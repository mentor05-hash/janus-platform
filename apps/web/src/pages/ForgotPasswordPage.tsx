import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';

/** 비밀번호 재설정 — 아이디로 토큰 요청 → 토큰+새 비밀번호로 확정. (데모: 발급 토큰을 화면에 표시) */
export function ForgotPasswordPage() {
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [loginId, setLoginId] = useState('');
  const [token, setToken] = useState('');
  const [pw, setPw] = useState('');
  const [devToken, setDevToken] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function request() {
    setError(''); setMsg('');
    try {
      const r = await api.post<{ message: string; devToken?: string }>('/auth/password-reset/request', { loginId });
      setMsg(r.message);
      if (r.devToken) { setDevToken(r.devToken); setToken(r.devToken); }
      setStep(2);
    } catch (e) { setError(e instanceof ApiError ? e.message : '요청 실패'); }
  }
  async function confirm() {
    setError(''); setMsg('');
    try {
      await api.post('/auth/password-reset/confirm', { token, newPassword: pw });
      alert('비밀번호가 변경되었습니다. 새 비밀번호로 로그인하세요.');
      nav('/login');
    } catch (e) { setError(e instanceof ApiError ? e.message : '변경 실패'); }
  }

  return (
    <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="card" style={{ width: '100%', maxWidth: 380 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, color: 'var(--ink)' }}>비밀번호 재설정</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>가입 아이디로 재설정 토큰을 발급받습니다.</p>
        {error && <p className="error">{error}</p>}
        {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}

        {step === 1 ? (
          <>
            <label className="label">아이디</label>
            <input className="input" value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="로그인 아이디" />
            <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={request} disabled={!loginId.trim()}>재설정 요청</button>
          </>
        ) : (
          <>
            {devToken && (
              <div style={{ background: 'var(--teal-50,#EEF4FB)', borderRadius: 8, padding: 9, fontSize: 12, color: 'var(--teal)', marginBottom: 8, wordBreak: 'break-all' }}>
                데모: 발급 토큰이 자동 입력되었습니다. 실제 서비스는 이메일/SMS로 전송됩니다.
              </div>
            )}
            <label className="label">재설정 토큰</label>
            <input className="input" value={token} onChange={(e) => setToken(e.target.value)} placeholder="토큰" />
            <label className="label" style={{ marginTop: 8 }}>새 비밀번호</label>
            <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="영문+숫자 6자 이상" />
            <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={confirm} disabled={!token.trim() || pw.length < 6}>비밀번호 변경</button>
          </>
        )}
        <p style={{ fontSize: 12, textAlign: 'center', margin: '12px 0 0' }}>
          <Link to="/login" style={{ color: 'var(--teal)' }}>로그인으로</Link>
        </p>
      </div>
    </div>
  );
}
