import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { HrTeacher } from '../api/types';
import { PageHeader, Card, Button, Badge, GradeBadge, Spinner, ErrorText, EmptyState, TextField, SelectField } from '../components/ui';

const SUBJECTS = ['국어', '수학', '영어', '과학', '사회', '입시'];
const GRADES = ['S', 'A', 'B'];
const CATEGORIES = ['교과 코치', '명문대 멘토', '입시 소장', '심리 코치'];

export function HrTeachersPage() {
  const [rows, setRows] = useState<HrTeacher[] | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [f, setF] = useState({ loginId: '', name: '', password: '', subject: '수학', grade: 'A', category: '교과 코치', career: '' });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    try { setRows(await api.get<HrTeacher[]>('/hr/teachers')); }
    catch (e) { setError(e instanceof ApiError ? e.message : '조회 실패'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function register() {
    setMsg(''); setError('');
    if (!f.loginId.trim() || !f.name.trim()) { setError('아이디·이름은 필수입니다.'); return; }
    try {
      await api.post('/hr/teachers', { loginId: f.loginId, name: f.name, password: f.password || undefined, subjects: [f.subject], grade: f.grade, category: f.category, career: f.career || undefined });
      setMsg(`${f.name} 선생님이 등록되었습니다.`);
      setF({ ...f, loginId: '', name: '', password: '', career: '' });
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '등록 실패'); }
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'var(--fill,#f6f8fa)' };
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, borderTop: '1px solid var(--line)' };

  return (
    <div>
      <PageHeader title="선생님 등록 · 관리" sub="자격·급여 기준·직군 등록 → 예상급여(급여 화면)와 연동됩니다." />
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
      <ErrorText>{error}</ErrorText>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Card title="새 선생님 등록" style={{ flex: '1 1 300px', minWidth: 280 }}>
          <TextField label="아이디" value={f.loginId} onChange={(e) => set('loginId', e.target.value)} />
          <TextField label="이름" value={f.name} onChange={(e) => set('name', e.target.value)} />
          <TextField label="임시 비밀번호(생략 시 자동)" value={f.password} onChange={(e) => set('password', e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}><SelectField label="과목" value={f.subject} onChange={(e) => set('subject', e.target.value)} options={SUBJECTS.map((s) => ({ value: s, label: s }))} /></div>
            <div style={{ width: 90 }}><SelectField label="등급" value={f.grade} onChange={(e) => set('grade', e.target.value)} options={GRADES.map((g) => ({ value: g, label: `${g}급` }))} /></div>
          </div>
          <SelectField label="직군" value={f.category} onChange={(e) => set('category', e.target.value)} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
          <TextField label="경력(선택)" value={f.career} onChange={(e) => set('career', e.target.value)} placeholder="예: 대치 5년" />
          <Button block onClick={register} disabled={!f.loginId.trim() || !f.name.trim()}>등록</Button>
        </Card>

        <Card title="선생님 목록" style={{ flex: '1 1 420px', minWidth: 340, padding: 0, overflow: 'hidden' }}>
          {rows === null ? <Spinner /> : rows.length === 0 ? <div style={{ padding: 16 }}><EmptyState>등록된 선생님이 없어요.</EmptyState></div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>이름</th><th style={th}>과목</th><th style={th}>등급</th><th style={th}>직군</th><th style={th}>상태</th></tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td style={td}><b>{t.name}</b></td>
                    <td style={td}>{t.subjects.join(', ') || '-'}</td>
                    <td style={td}><GradeBadge grade={t.grade} /></td>
                    <td style={td}>{t.category ?? '-'}</td>
                    <td style={td}><Badge kind={t.status === 'approved' ? 'done' : 'confirmed'}>{t.status === 'approved' ? '활성' : '대기'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
