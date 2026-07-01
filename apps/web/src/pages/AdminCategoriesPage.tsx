import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, ErrorText, TextField, EmptyState } from '../components/ui';

type Cat = { id: string; name: string; kind: string };

function CatSection({ kind, title }: { kind: 'material' | 'teacher'; title: string }) {
  const [rows, setRows] = useState<Cat[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function load() { api.get<Cat[]>(`/categories?kind=${kind}`).then(setRows).catch(() => {}); }
  useEffect(load, []);

  async function add() {
    if (!name.trim()) return;
    setError('');
    try { await api.post('/categories', { kind, name: name.trim() }); setName(''); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '추가 실패'); }
  }
  async function del(id: string) {
    setError('');
    try { await api.del(`/categories/${id}`); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '삭제 실패'); }
  }

  return (
    <Card title={title} style={{ flex: '1 1 360px', minWidth: 320 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}><TextField placeholder="새 카테고리 이름" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} /></div>
        <Button onClick={add} disabled={!name.trim()}>추가</Button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      {rows.length === 0 ? <EmptyState>카테고리 없음</EmptyState> : rows.map((c) => (
        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <span>{c.name}</span>
          <Button variant="ghost" size="sm" onClick={() => del(c.id)}>삭제</Button>
        </div>
      ))}
    </Card>
  );
}

export function AdminCategoriesPage() {
  return (
    <div>
      <PageHeader title="카테고리 관리" sub="자료실·선생님 분류 카테고리를 관리합니다(본사관리자 전용)." />
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <CatSection kind="material" title="자료실 카테고리" />
        <CatSection kind="teacher" title="선생님 카테고리" />
      </div>
    </div>
  );
}
