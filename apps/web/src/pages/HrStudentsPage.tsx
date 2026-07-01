import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { HrStudent } from '../api/types';
import { PageHeader, Card, Button, Badge, Spinner, ErrorText, EmptyState, TextareaField } from '../components/ui';

export function HrStudentsPage() {
  const [rows, setRows] = useState<HrStudent[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api.get<HrStudent[]>('/hr/students')); setError(''); }
    catch (e) { setError(e instanceof ApiError ? e.message : '조회 실패'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function approve(id: string) {
    try { await api.post(`/hr/students/${id}/approve`, {}); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '승인 실패'); }
  }

  // CSV: "아이디,이름[,비밀번호]" 줄바꿈 구분
  function parseCsv(text: string) {
    return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      .filter((l) => !/^(아이디|loginId)\s*,/.test(l))
      .map((l) => { const [loginId, name, password] = l.split(',').map((x) => x?.trim()); return { loginId, name, password: password || undefined }; })
      .filter((r) => r.loginId && r.name);
  }
  async function bulkRegister() {
    const students = parseCsv(csv);
    if (!students.length) { setError('등록할 행이 없습니다. "아이디,이름" 형식으로 입력하세요.'); return; }
    setMsg(''); setError('');
    try {
      const r = await api.post<{ created: number; failed: number; errors: { loginId: string; reason: string }[] }>('/hr/students/bulk', { students });
      setMsg(`${r.created}명 등록 완료${r.failed ? ` · 실패 ${r.failed}명(${r.errors.map((e) => e.loginId).join(', ')})` : ''}`);
      setCsv(''); setBulkOpen(false); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '일괄 등록 실패'); }
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => { setCsv(String(r.result ?? '')); setBulkOpen(true); }; r.readAsText(f, 'utf-8');
    e.target.value = '';
  }

  if (loading) return <Spinner />;
  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'var(--fill,#f6f8fa)' };
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, borderTop: '1px solid var(--line)' };

  return (
    <div>
      <PageHeader title="학생 등록 · 관리" sub="자가가입 후 승인 기본 · DB 파일 일괄 등록(CSV) 지원" />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Button variant="ghost" onClick={() => setBulkOpen((o) => !o)}>📄 DB 일괄 등록(CSV)</Button>
        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" style={{ display: 'none' }} onChange={onFile} />
        <Button variant="ghost" onClick={() => fileRef.current?.click()}>파일 선택</Button>
        <Button variant="ghost" disabled title="외부 앱 연동은 준비 중입니다.">🔗 외부 연동(준비 중)</Button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--teal)', background: 'var(--teal-50,#F0F7FA)', border: '1px solid var(--teal-100,#DCECF3)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.5 }}>
        민감정보(인적사항·보호자 정보)는 저장소(git)에 저장하지 않고 로컬/서버 DB에만 보관하며, 권한별로 마스킹됩니다.
      </p>
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
      <ErrorText>{error}</ErrorText>

      {bulkOpen && (
        <Card style={{ maxWidth: 620, marginBottom: 12 }}>
          <TextareaField label='CSV 입력 ("아이디,이름[,비밀번호]" 한 줄에 한 명)' rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'stu1001,김민준\nstu1002,이서연,temp1234'} />
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>비밀번호 생략 시 임시 비밀번호가 발급되고, 승인 상태로 등록됩니다.</p>
          <Button onClick={bulkRegister} disabled={!csv.trim()}>일괄 등록</Button>
        </Card>
      )}

      {rows.length === 0 ? <Card><EmptyState>학생이 없습니다.</EmptyState></Card> : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>이름</th><th style={th}>아이디</th><th style={th}>센터</th><th style={th}>회원 등급</th><th style={th}>상태</th><th style={th} /></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td style={td}><b>{s.name}</b></td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{s.login_id}</td>
                  <td style={td}>{s.centerName ?? '-'}</td>
                  <td style={td}>{s.membershipGrade ? <Badge kind="soft">{s.membershipGrade}</Badge> : '-'}</td>
                  <td style={td}><Badge kind={s.status === 'approved' ? 'done' : 'confirmed'}>{s.status === 'approved' ? '승인' : '대기'}</Badge></td>
                  <td style={{ ...td, textAlign: 'right' }}>{s.status !== 'approved' && <Button size="sm" onClick={() => approve(s.id)}>승인</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
