import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { Button, ErrorText, TextField, PasswordField, SelectField } from '../components/ui';

const ROLES = [
  { value: 'student', label: '학생' },
  { value: 'teacher', label: '선생님' },
  { value: 'guardian', label: '학부모' },
];

export function SignupPage() {
  const navigate = useNavigate();
  const [f, setF] = useState({ loginId: '', password: '', name: '', role: 'student' as 'student' | 'teacher' | 'guardian' });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.signup({ loginId: f.loginId, password: f.password, name: f.name, role: f.role });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '가입 신청 실패');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
        <div className="card" style={{ width: 360, textAlign: 'center' }}>
          <h2 style={{ marginTop: 0, color: 'var(--teal)' }}>가입 신청 완료</h2>
          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
            가입 신청이 접수되었습니다.<br />관리자(HR) 승인 후 로그인할 수 있습니다.
          </p>
          <Button block style={{ marginTop: 12 }} onClick={() => navigate('/login')}>로그인 화면으로</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: '30px 0' }}>
      <form className="card" style={{ width: 360 }} onSubmit={onSubmit}>
        <h2 style={{ marginTop: 0, color: 'var(--teal)' }}>잇올 멘토링 회원가입</h2>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>
          가입 후 관리자 승인이 완료되면 로그인할 수 있습니다.
        </p>
        <SelectField label="가입 유형" value={f.role} onChange={(e) => set('role', e.target.value)} options={ROLES} />
        <TextField label="아이디" value={f.loginId} onChange={(e) => set('loginId', e.target.value)} placeholder="영문/숫자 아이디" />
        <TextField label="이름" value={f.name} onChange={(e) => set('name', e.target.value)} />
        <PasswordField label="비밀번호" value={f.password} onChange={(e) => set('password', e.target.value)} />
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: '-4px 0 8px' }}>
          8자 이상 · 영문+숫자 포함 · 아이디 미포함 · 동일문자 반복 불가
        </p>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" block loading={busy} disabled={!f.loginId || !f.password || !f.name} style={{ marginTop: 8 }}>
          가입 신청
        </Button>
        <p style={{ fontSize: 12, textAlign: 'center', margin: '12px 0 0' }}>
          이미 계정이 있으신가요? <Link to="/login" style={{ color: 'var(--teal)', fontWeight: 700 }}>로그인</Link>
        </p>
      </form>
    </div>
  );
}
