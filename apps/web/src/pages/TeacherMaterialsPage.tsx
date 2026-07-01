import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, tokens } from '../api/client';
import type { Material } from '../api/types';
import { PageHeader, Card, Button, Badge, Spinner, ErrorText, Table, Tabs, SelectField } from '../components/ui';
import type { Column } from '../components/ui';

const VIS_LABEL: Record<string, string> = { public: '전사 공개', center: '센터 공개', private: '비공개' };
const VIS_KIND: Record<string, 'done' | 'confirmed' | 'cancelled'> = { public: 'done', center: 'confirmed', private: 'cancelled' };
const SUBJECTS = ['수학', '국어', '영어', '탐구'];

export function TeacherMaterialsPage() {
  const [rows, setRows] = useState<Material[]>([]);
  const [tab, setTab] = useState('mine');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'칼럼' | '기출' | '자료'>('칼럼');
  const [subject, setSubject] = useState('수학');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('center');
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.get<Material[]>(`/materials${tab === 'mine' ? '?mine=true' : ''}`));
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { void load(); }, [load]);

  async function submit() {
    if (!title.trim()) return alert('제목을 입력하세요');
    setSaving(true);
    setMsg('');
    try {
      const form = new FormData();
      form.append('title', `[${kind}] ${title}`);
      if (subject) form.append('subject', subject);
      if (description) form.append('description', description);
      form.append('visibility', visibility);
      const f = fileRef.current?.files?.[0];
      if (f) form.append('file', f);
      await api.upload('/materials', form);
      setTitle(''); setDescription(''); setFileName('');
      if (fileRef.current) fileRef.current.value = '';
      setMsg('게시되었습니다.');
      setTab('mine');
      await load();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '게시 실패');
    } finally {
      setSaving(false);
    }
  }

  async function download(m: Material) {
    try {
      const res = await fetch(`/api/v1${m.downloadUrl}`, { headers: { Authorization: `Bearer ${tokens.access}` } });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = m.filename ?? 'material'; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('다운로드 실패'); }
  }
  async function remove(m: Material) {
    if (!window.confirm(`"${m.title}" 자료를 삭제할까요?`)) return;
    try { await api.del(`/materials/${m.id}`); await load(); } catch (e) { alert(e instanceof ApiError ? e.message : '삭제 실패'); }
  }

  const columns: Column<Material>[] = [
    {
      key: 'title', header: '제목',
      render: (m) => (
        <>
          <strong>{m.title}</strong>
          {m.subject && <span style={{ color: 'var(--muted)', marginLeft: 6 }}>· {m.subject}</span>}
          {m.description && <div style={{ color: 'var(--muted)', fontSize: 12 }}>{m.description}</div>}
        </>
      ),
    },
    { key: 'visibility', header: '공개', render: (m) => <Badge kind={VIS_KIND[m.visibility]}>{VIS_LABEL[m.visibility]}</Badge> },
    { key: 'views', header: '조회', render: (m) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{(m.views ?? 0).toLocaleString()}</span> },
    { key: 'file', header: '파일', render: (m) => (m.downloadUrl ? <Button size="sm" variant="ghost" onClick={() => download(m)}>{m.filename ?? '다운로드'}</Button> : <span style={{ color: 'var(--muted)' }}>없음</span>) },
    { key: 'actions', header: '', align: 'right', render: (m) => (tab === 'mine' ? <Button size="sm" variant="danger" onClick={() => remove(m)}>삭제</Button> : null) },
  ];

  return (
    <div>
      <PageHeader title="자료 업로드" sub="칼럼·기출 자료를 올리면 학생이 즐겨찾기하고, 온라인 신청 시 우선권을 줄 수 있어요." />
      <ErrorText>{error}</ErrorText>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px,360px) 1fr', gap: 16, alignItems: 'start' }}>
        {/* 새 게시물 */}
        <Card title="새 게시물">
          <label className="label">제목</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 합성함수 미분 핵심 정리" />

          <label className="label" style={{ marginTop: 12 }}>유형</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['칼럼', '기출', '자료'] as const).map((k) => (
              <button key={k} className="btn sm" style={chip(kind === k)} onClick={() => setKind(k)}>{k === '기출' ? '기출 자료' : k}</button>
            ))}
          </div>

          <label className="label" style={{ marginTop: 12 }}>과목</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SUBJECTS.map((s) => (
              <button key={s} className="btn sm" style={chip(subject === s)} onClick={() => setSubject(s)}>{s}</button>
            ))}
          </div>

          <label className="label" style={{ marginTop: 12 }}>내용</label>
          <textarea className="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="자료 설명" />

          <label className="label" style={{ marginTop: 12 }}>파일</label>
          <div
            onClick={() => fileRef.current?.click()}
            style={{ border: '1.5px dashed var(--input-border)', borderRadius: 10, padding: '18px 12px', textAlign: 'center', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', background: 'var(--fill-50)' }}
          >
            ⬆ {fileName || '파일 끌어다 놓기 · PDF, 이미지'}
          </div>
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')} />

          <div style={{ marginTop: 12 }}>
            <SelectField
              label="공개범위"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              options={[
                { value: 'center', label: '센터 공개(자기 센터)' },
                { value: 'public', label: '전사 공개(모든 학생)' },
                { value: 'private', label: '비공개(본인·관리자)' },
              ]}
            />
          </div>
          <Button block style={{ marginTop: 12 }} loading={saving} onClick={submit}>게시하기</Button>
          {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13, marginTop: 8 }}>{msg}</p>}
        </Card>

        {/* 목록 */}
        <Card title="게시 자료">
          <Tabs items={[{ value: 'mine', label: '내 게시물' }, { value: 'all', label: '열람 가능 전체' }]} value={tab} onChange={setTab} />
          {loading ? <Spinner /> : <Table columns={columns} rows={rows} rowKey={(m) => m.id} empty="자료가 없습니다." />}
        </Card>
      </div>
    </div>
  );
}

function chip(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    background: active ? 'var(--teal-50)' : '#fff',
    color: active ? 'var(--teal)' : 'var(--muted)',
    border: `1px solid ${active ? 'var(--teal-100)' : 'var(--line)'}`,
    boxShadow: 'none',
  };
}
