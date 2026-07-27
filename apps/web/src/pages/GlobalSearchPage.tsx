import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Badge, ErrorText, Spinner, EmptyState, TextField, Button } from '../components/ui';

type Hit = { type: 'lecture' | 'material' | 'community' | 'teacher'; id: string; title: string; subtitle?: string | null; subject?: string | null; href: string };
type Result = { q: string; total: number; groups: Record<string, Hit[]> };

const GROUP_META: Record<string, { label: string; icon: string }> = {
  lecture: { label: '강좌', icon: '◧' },
  material: { label: '자료실', icon: '▤' },
  community: { label: '커뮤니티 Q&A', icon: '◎' },
  teacher: { label: '선생님', icon: '👤' },
};
const ORDER = ['teacher', 'lecture', 'community', 'material'];

/** 전역 통합검색 — 강좌·자료·커뮤니티·선생님을 한 번에 조회. GET /search?q= */
export function GlobalSearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [term, setTerm] = useState(q);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const run = useCallback((query: string) => {
    if (!query.trim()) { setResult(null); return; }
    setLoading(true); setError('');
    api.get<Result>(`/search?q=${encodeURIComponent(query.trim())}`)
      .then(setResult)
      .catch((e) => setError(e instanceof ApiError ? e.message : '검색 실패'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { setTerm(q); run(q); }, [q, run]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setParams(term.trim() ? { q: term.trim() } : {});
  }

  return (
    <div>
      <PageHeader title="통합검색" sub="강좌·자료·커뮤니티·선생님을 한 번에 찾아보세요." />
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginBottom: 16, maxWidth: 520 }}>
        <div style={{ flex: 1 }}><TextField value={term} onChange={(e) => setTerm(e.target.value)} placeholder="검색어를 입력하세요 (예: 미적분, 국어)" autoFocus /></div>
        <Button type="submit">검색</Button>
      </form>

      {error && <ErrorText>{error}</ErrorText>}
      {loading ? <Spinner /> : !result ? (
        <Card><EmptyState>검색어를 입력하면 강좌·자료·커뮤니티·선생님에서 함께 찾아드려요.</EmptyState></Card>
      ) : result.total === 0 ? (
        <Card><EmptyState>‘{result.q}’에 대한 결과가 없어요. 다른 검색어를 시도해보세요.</EmptyState></Card>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>‘{result.q}’ 결과 {result.total}건</div>
          {ORDER.filter((g) => result.groups[g]?.length).map((g) => {
            const meta = GROUP_META[g];
            return (
              <Card key={g} title={`${meta.icon} ${meta.label} ${result.groups[g].length}`}>
                <div style={{ display: 'grid', gap: 2 }}>
                  {result.groups[g].map((h) => (
                    <Link key={h.id} to={h.href} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: '1px solid var(--line)', textDecoration: 'none', color: 'inherit' }}>
                      {h.subject && <Badge kind="soft">{h.subject}</Badge>}
                      <span style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title}</span>
                      {h.subtitle && <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{h.subtitle}</span>}
                    </Link>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
