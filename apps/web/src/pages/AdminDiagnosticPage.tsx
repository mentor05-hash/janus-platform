import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, EmptyState, TextField, TextareaField, SelectField } from '../components/ui';

// 진단 문항 관리 — 등록 + 목록(정답 포함·활성 토글).
type Question = { id: string; subject: string; unit: string; difficulty: string | null; stem: string; choices: string[]; answer: number; explanation: string | null; source: string; active: boolean };
const SUBJECTS = ['국어', '수학', '영어'];
const DIFFS = ['', '하', '중', '상'];

export function AdminDiagnosticPage() {
  const [subjectFilter, setSubjectFilter] = useState('');
  const [list, setList] = useState<Question[] | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ subject: '수학', unit: '', difficulty: '중', stem: '', choices: ['', '', '', ''], answer: 0, explanation: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setList(null);
    api.get<Question[]>(`/admin/diagnostics/questions${subjectFilter ? `?subject=${encodeURIComponent(subjectFilter)}` : ''}`)
      .then(setList).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, [subjectFilter]);
  useEffect(() => { load(); }, [load]);

  async function create() {
    const choices = f.choices.map((c) => c.trim()).filter(Boolean);
    if (!f.unit.trim() || !f.stem.trim() || choices.length < 2) { setError('유형·문항·보기(2개 이상)를 입력해 주세요.'); return; }
    if (f.answer >= choices.length) { setError('정답 번호가 보기 수를 벗어났어요.'); return; }
    setBusy(true); setError(''); setMsg('');
    try {
      await api.post('/admin/diagnostics/questions', {
        subject: f.subject, unit: f.unit, difficulty: f.difficulty || undefined, stem: f.stem,
        choices, answer: f.answer, explanation: f.explanation || undefined,
      });
      setF({ subject: f.subject, unit: '', difficulty: '중', stem: '', choices: ['', '', '', ''], answer: 0, explanation: '' });
      setMsg('문항을 등록했어요.'); setShowForm(false); load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '등록 실패'); }
    finally { setBusy(false); }
  }

  async function toggle(q: Question) {
    try { await api.patch(`/admin/diagnostics/questions/${q.id}/active`, { active: !q.active }); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '변경 실패'); }
  }

  const setChoice = (i: number, v: string) => setF((s) => ({ ...s, choices: s.choices.map((c, idx) => (idx === i ? v : c)) }));

  return (
    <div>
      <PageHeader title="진단 문항 관리" sub="실력진단 문제은행을 등록·관리해요. (실수능 문항은 저작권 확인 후 등록)" />
      <ErrorText>{error}</ErrorText>
      {msg && <div style={{ fontSize: 13, color: 'var(--brand)', marginBottom: 8 }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? '닫기' : '＋ 문항 등록'}</Button>
        <div style={{ minWidth: 130, marginLeft: 'auto' }}>
          <SelectField label="과목 필터" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}
            options={[{ value: '', label: '전체' }, ...SUBJECTS.map((s) => ({ value: s, label: s }))]} />
        </div>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 110 }}><SelectField label="과목" value={f.subject} onChange={(e) => setF((s) => ({ ...s, subject: e.target.value }))} options={SUBJECTS.map((s) => ({ value: s, label: s }))} /></div>
              <TextField label="유형" value={f.unit} onChange={(e) => setF((s) => ({ ...s, unit: e.target.value }))} placeholder="예: 미적분" />
              <div style={{ minWidth: 100 }}><SelectField label="난이도" value={f.difficulty} onChange={(e) => setF((s) => ({ ...s, difficulty: e.target.value }))} options={DIFFS.map((d) => ({ value: d, label: d || '선택' }))} /></div>
            </div>
            <TextareaField label="문항" value={f.stem} onChange={(e) => setF((s) => ({ ...s, stem: e.target.value }))} rows={2} placeholder="문제 내용" />
            <div style={{ display: 'grid', gap: 6 }}>
              <div className="label">보기 (정답 라디오 선택)</div>
              {f.choices.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="radio" name="answer" checked={f.answer === i} onChange={() => setF((s) => ({ ...s, answer: i }))} />
                  <input className="input" value={c} onChange={(e) => setChoice(i, e.target.value)} placeholder={`보기 ${i + 1}`} style={{ flex: 1 }} />
                </div>
              ))}
            </div>
            <TextField label="해설(선택)" value={f.explanation} onChange={(e) => setF((s) => ({ ...s, explanation: e.target.value }))} placeholder="정답 해설" />
            <div><Button onClick={create} disabled={busy}>{busy ? '등록 중…' : '등록'}</Button></div>
          </div>
        </Card>
      )}

      {list === null ? <Spinner /> : list.length === 0 ? (
        <EmptyState>등록된 문항이 없어요.</EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {list.map((q) => (
            <Card key={q.id} style={q.active ? undefined : { opacity: 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                <Badge kind="new">{q.subject}</Badge><Badge kind="soft">{q.unit}</Badge>
                {q.difficulty && <Badge kind="soft">{q.difficulty}</Badge>}
                {q.source === 'demo' && <Badge kind="soft">데모</Badge>}
                {!q.active && <Badge kind="soft">비활성</Badge>}
                <button onClick={() => toggle(q)} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--line-soft)', borderRadius: 8, padding: '4px 10px', fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>{q.active ? '비활성화' : '활성화'}</button>
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink)', marginBottom: 4 }}>{q.stem}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                {q.choices.map((c, i) => (<span key={i} style={{ color: i === q.answer ? 'var(--brand)' : 'var(--muted)', fontWeight: i === q.answer ? 700 : 400 }}>{i + 1}. {c}{i < q.choices.length - 1 ? '  ' : ''}</span>))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
