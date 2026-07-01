import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, tokens } from '../api/client';
import type { Material } from '../api/types';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, EmptyState, TextField, SelectField, Modal } from '../components/ui';

type Cat = { id: string; name: string };
const sizeStr = (n: number | null) => (n == null ? '' : n < 1048576 ? `${Math.round(n / 1024)}KB` : `${(n / 1048576).toFixed(1)}MB`);

/** 미리보기 모달: 다운로드 전에 내용 확인(텍스트·이미지·PDF). */
function Preview({ m, onClose }: { m: Material; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [kind, setKind] = useState<'image' | 'pdf' | 'text' | 'none'>('none');
  const [err, setErr] = useState('');
  useEffect(() => {
    let revoke: string | null = null;
    (async () => {
      try {
        const res = await fetch(`/api/v1${m.downloadUrl}`, { headers: tokens.access ? { Authorization: `Bearer ${tokens.access}` } : {} });
        if (!res.ok) throw new Error();
        const ct = res.headers.get('Content-Type') ?? '';
        const name = (m.filename ?? '').toLowerCase();
        const blob = await res.blob();
        if (ct.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(name)) { revoke = URL.createObjectURL(blob); setUrl(revoke); setKind('image'); }
        else if (ct.includes('pdf') || name.endsWith('.pdf')) { revoke = URL.createObjectURL(blob); setUrl(revoke); setKind('pdf'); }
        else if (ct.startsWith('text/') || /\.(txt|md|csv|json)$/.test(name)) { setText(await blob.text()); setKind('text'); }
        else setKind('none');
      } catch { setErr('미리보기를 불러오지 못했어요.'); }
    })();
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [m]);
  async function download() {
    const res = await fetch(`/api/v1${m.downloadUrl}`, { headers: tokens.access ? { Authorization: `Bearer ${tokens.access}` } : {} });
    const blob = await res.blob(); const u = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = u; a.download = m.filename ?? m.title; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
  }
  return (
    <Modal open title={m.title} onClose={onClose} footer={<Button onClick={download}>⬇ 다운로드 {m.filename ? `(${m.filename})` : ''}</Button>}>
      <div style={{ maxHeight: '60vh', overflow: 'auto', marginBottom: 12 }}>
        {err && <ErrorText>{err}</ErrorText>}
        {kind === 'image' && url && <img src={url} alt={m.title} style={{ maxWidth: '100%' }} />}
        {kind === 'pdf' && url && <iframe title="preview" src={url} style={{ width: '100%', height: '55vh', border: 'none' }} />}
        {kind === 'text' && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, fontFamily: 'inherit' }}>{text}</pre>}
        {kind === 'none' && !err && <p style={{ color: 'var(--muted)' }}>이 형식은 미리보기를 지원하지 않아요. 다운로드해 확인하세요.</p>}
      </div>
    </Modal>
  );
}

export function StudentMaterialsPage() {
  const [rows, setRows] = useState<Material[] | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [category, setCategory] = useState('전체');
  const [subject, setSubject] = useState('전체');
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState<Material | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Material[]>('/materials').then(setRows).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
    api.get<Cat[]>('/categories?kind=material').then(setCats).catch(() => {});
  }, []);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return (rows ?? []).filter((m) =>
      (category === '전체' || m.category === category) &&
      (subject === '전체' || m.subject === subject) &&
      (!kw || m.title.toLowerCase().includes(kw) || (m.description ?? '').toLowerCase().includes(kw)),
    );
  }, [rows, category, subject, q]);

  return (
    <div>
      <PageHeader title="자료실" sub="선생님이 올린 학습자료를 미리보고 다운로드합니다(공개 및 우리 센터 자료)." />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ flex: '1 1 220px', minWidth: 180 }}><TextField label="검색" placeholder="제목·설명" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div style={{ minWidth: 150 }}><SelectField label="카테고리" value={category} onChange={(e) => setCategory(e.target.value)} options={['전체', ...cats.map((c) => c.name)].map((c) => ({ value: c, label: c }))} /></div>
        <div style={{ minWidth: 120 }}><SelectField label="과목" value={subject} onChange={(e) => setSubject(e.target.value)} options={['전체', '국어', '수학', '영어', '탐구'].map((s) => ({ value: s, label: s }))} /></div>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      {rows === null ? <Spinner /> : list.length === 0 ? <Card><EmptyState>조건에 맞는 자료가 없어요.</EmptyState></Card> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {list.map((m) => (
            <Card key={m.id}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                {m.category && <Badge kind="soft">{m.category}</Badge>}
                {m.subject && <Badge kind="soft">{m.subject}</Badge>}
                <Badge kind={m.visibility === 'public' ? 'done' : 'confirmed'}>{m.visibility === 'public' ? '전체 공개' : '우리 센터'}</Badge>
              </div>
              <b style={{ fontSize: 15 }}>{m.title}</b>
              {m.description && <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0' }}>{m.description}</p>}
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{m.teacherName ?? '선생님'}{m.centerName ? ` · ${m.centerName}` : ''}{m.size ? ` · ${sizeStr(m.size)}` : ''}</div>
              <div style={{ marginTop: 10 }}>
                {m.downloadUrl ? <Button size="sm" onClick={() => setPreview(m)}>👁 미리보기 · 다운로드</Button> : <span style={{ fontSize: 12, color: 'var(--muted)' }}>첨부 없음</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
      {preview && <Preview m={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
