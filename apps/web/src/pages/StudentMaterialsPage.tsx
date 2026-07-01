import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, tokens } from '../api/client';
import type { Material } from '../api/types';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, EmptyState, SelectField } from '../components/ui';

const SUBJECTS = ['전체', '국어', '수학', '영어', '탐구'];
const sizeStr = (n: number | null) => (n == null ? '' : n < 1024 * 1024 ? `${Math.round(n / 1024)}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`);

export function StudentMaterialsPage() {
  const [rows, setRows] = useState<Material[] | null>(null);
  const [subject, setSubject] = useState('전체');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Material[]>('/materials').then(setRows).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, []);

  const list = useMemo(() => (rows ?? []).filter((m) => subject === '전체' || m.subject === subject), [rows, subject]);

  async function download(m: Material) {
    if (!m.downloadUrl) return;
    try {
      const res = await fetch(`/api/v1${m.downloadUrl}`, { headers: tokens.access ? { Authorization: `Bearer ${tokens.access}` } : {} });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = m.filename ?? m.title; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch { setError('다운로드에 실패했어요.'); }
  }

  return (
    <div>
      <PageHeader title="자료실" sub="선생님이 올린 학습자료를 열람·다운로드합니다(공개 자료 및 우리 센터 자료)." />
      <div style={{ maxWidth: 200, marginBottom: 12 }}>
        <SelectField label="과목" value={subject} onChange={(e) => setSubject(e.target.value)} options={SUBJECTS.map((s) => ({ value: s, label: s }))} />
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      {rows === null ? <Spinner /> : list.length === 0 ? <Card><EmptyState>열람 가능한 자료가 없어요.</EmptyState></Card> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {list.map((m) => (
            <Card key={m.id}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                {m.subject && <Badge kind="soft">{m.subject}</Badge>}
                <Badge kind={m.visibility === 'public' ? 'done' : 'confirmed'}>{m.visibility === 'public' ? '전체 공개' : '우리 센터'}</Badge>
              </div>
              <b style={{ fontSize: 15 }}>{m.title}</b>
              {m.description && <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0' }}>{m.description}</p>}
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                {m.teacherName ?? '선생님'}{m.centerName ? ` · ${m.centerName}` : ''}{m.size ? ` · ${sizeStr(m.size)}` : ''}
              </div>
              <div style={{ marginTop: 10 }}>
                {m.downloadUrl ? <Button size="sm" onClick={() => download(m)}>⬇ 다운로드 {m.filename ? `(${m.filename})` : ''}</Button> : <span style={{ fontSize: 12, color: 'var(--muted)' }}>첨부 없음</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
