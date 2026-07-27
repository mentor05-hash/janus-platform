import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, EmptyState, TextField, TextareaField, SelectField } from '../components/ui';

// 교사 강좌 관리 — 등록 + 내 강좌(수강 인원·활성 토글).
type MyLecture = { id: string; subject: string; unit: string | null; title: string; summary: string | null; level: string | null; minutes: number | null; active: boolean; enrolled: number };
const SUBJECTS = ['국어', '수학', '영어', '탐구'];
const LEVELS = ['', '입문', '기본', '심화'];

export function TeacherLecturesPage() {
  const [list, setList] = useState<MyLecture[] | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [f, setF] = useState({ subject: '수학', unit: '', title: '', summary: '', level: '', minutes: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setList(null);
    api.get<MyLecture[]>('/lectures/mine').then(setList).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!f.title.trim()) { setError('강좌 제목을 입력해 주세요.'); return; }
    setBusy(true); setError(''); setMsg('');
    try {
      await api.post('/lectures', {
        subject: f.subject, unit: f.unit || undefined, title: f.title, summary: f.summary || undefined,
        level: f.level || undefined, minutes: f.minutes ? Number(f.minutes) : undefined,
      });
      setF({ subject: '수학', unit: '', title: '', summary: '', level: '', minutes: '' }); setShowForm(false);
      setMsg('강좌를 등록했어요.'); load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '등록 실패'); }
    finally { setBusy(false); }
  }

  async function toggle(l: MyLecture) {
    try { await api.patch(`/lectures/${l.id}/active`, { active: !l.active }); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '변경 실패'); }
  }

  return (
    <div>
      <PageHeader title="내 강좌" sub="약점 유형을 겨냥한 강좌를 등록하고, 수강 현황을 확인하세요." />
      <ErrorText>{error}</ErrorText>
      {msg && <div style={{ fontSize: 13, color: 'var(--brand)', marginBottom: 8 }}>{msg}</div>}

      <div style={{ marginBottom: 12 }}>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? '닫기' : '＋ 강좌 등록'}</Button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 120 }}><SelectField label="과목" value={f.subject} onChange={(e) => setF((v) => ({ ...v, subject: e.target.value }))} options={SUBJECTS.map((s) => ({ value: s, label: s }))} /></div>
              <TextField label="유형(선택)" value={f.unit} onChange={(e) => setF((v) => ({ ...v, unit: e.target.value }))} placeholder="예: 미적분" />
              <div style={{ minWidth: 110 }}><SelectField label="난이도" value={f.level} onChange={(e) => setF((v) => ({ ...v, level: e.target.value }))} options={LEVELS.map((l) => ({ value: l, label: l || '선택' }))} /></div>
              <TextField label="시간(분)" value={f.minutes} onChange={(e) => setF((v) => ({ ...v, minutes: e.target.value }))} placeholder="예: 80" />
            </div>
            <TextField label="제목" value={f.title} onChange={(e) => setF((v) => ({ ...v, title: e.target.value }))} placeholder="강좌 제목" />
            <TextareaField label="소개(선택)" value={f.summary} onChange={(e) => setF((v) => ({ ...v, summary: e.target.value }))} rows={3} placeholder="어떤 학생에게, 무엇을 다루는 강좌인지" />
            <div><Button onClick={create} disabled={busy}>{busy ? '등록 중…' : '등록'}</Button></div>
          </div>
        </Card>
      )}

      {list === null ? <Spinner /> : list.length === 0 ? (
        <EmptyState>등록한 강좌가 없어요. 첫 강좌를 등록해보세요.</EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {list.map((l) => (
            <Card key={l.id} style={l.active ? undefined : { opacity: 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                <Badge kind="new">{l.subject}</Badge>
                {l.unit && <Badge kind="soft">{l.unit}</Badge>}
                {l.level && <Badge kind="soft">{l.level}</Badge>}
                {!l.active && <Badge kind="soft">비활성</Badge>}
                <span style={{ fontSize: 12, color: 'var(--caption)', marginLeft: 'auto' }}>수강 {l.enrolled}명{l.minutes != null ? ` · ${l.minutes}분` : ''}</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{l.title}</div>
              {l.summary && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{l.summary}</div>}
              <div style={{ marginTop: 8 }}>
                <button onClick={() => toggle(l)} style={{ background: 'none', border: '1px solid var(--line-soft)', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>
                  {l.active ? '비활성화' : '활성화'}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
