import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, EmptyState, TextareaField } from '../components/ui';

type Answer = { id: string; body: string; accepted: boolean; teacherName: string; createdAt: string };
type Post = { id: string; subject: string | null; difficulty: string | null; scope: string; body: string; status: string; created_at: string; answers: Answer[] };

const statusLabel = (p: Post) => (p.status === 'resolved' ? '채택완료' : p.answers.length > 0 ? '답변완료' : '답변대기');
const statusKind = (p: Post) => (p.status === 'resolved' ? 'done' : p.answers.length > 0 ? 'confirmed' : 'new') as 'new';

export function TeacherQnaPage() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() { api.get<Post[]>('/qna/posts').then(setPosts).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패')); }
  useEffect(load, []);

  async function answer(id: string) {
    const body = (draft[id] ?? '').trim();
    if (!body) return;
    setBusy(id); setError(''); setMsg('');
    try {
      await api.post(`/qna/posts/${id}/answers`, { body });
      setMsg('답변이 등록되었습니다.'); setDraft((d) => ({ ...d, [id]: '' })); load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '답변 실패'); } finally { setBusy(null); }
  }

  const open = (posts ?? []).filter((p) => p.status === 'open');
  const rest = (posts ?? []).filter((p) => p.status !== 'open');

  return (
    <div>
      <PageHeader title="질문 답변 (공개질문 큐)" sub="학생이 올린 공개·지정 질문에 답변합니다. 답변 후 학생이 채택하면 완료됩니다." />
      {error && <ErrorText>{error}</ErrorText>}
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}

      <h3 style={{ fontSize: 15, margin: '8px 0' }}>답변 대기 {open.length > 0 && <Badge kind="new">{open.length}</Badge>}</h3>
      {posts === null ? <Spinner /> : open.length === 0 ? <Card><EmptyState>답변할 질문이 없어요.</EmptyState></Card> : (
        open.map((p) => (
          <Card key={p.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              {p.subject && <Badge kind="soft">{p.subject}</Badge>}
              <Badge kind="soft">{p.scope === 'open' ? '공개' : '지정'}</Badge>
              {p.difficulty && <Badge kind="soft">난이도 {p.difficulty}</Badge>}
              <Badge kind={statusKind(p)}>{statusLabel(p)}</Badge>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>{new Date(p.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</span>
            </div>
            <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', margin: '0 0 10px' }}>{p.body}</p>
            {p.answers.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                {p.answers.map((a) => (
                  <div key={a.id} style={{ background: 'var(--fill,#f6f8fa)', borderRadius: 8, padding: 8, marginBottom: 6, fontSize: 13 }}>
                    <b>{a.teacherName}</b>{a.accepted && <Badge kind="done">채택</Badge>}<div style={{ whiteSpace: 'pre-wrap', marginTop: 2 }}>{a.body}</div>
                  </div>
                ))}
              </div>
            )}
            <TextareaField label="답변 작성" rows={3} value={draft[p.id] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value }))} placeholder="풀이·설명을 작성하세요." />
            <Button onClick={() => answer(p.id)} disabled={busy === p.id || !(draft[p.id] ?? '').trim()}>답변 등록</Button>
          </Card>
        ))
      )}

      <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>답변 완료 / 지정 질문</h3>
      {posts === null ? null : rest.length === 0 ? <Card><EmptyState>없음</EmptyState></Card> : (
        rest.map((p) => (
          <Card key={p.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              {p.subject && <Badge kind="soft">{p.subject}</Badge>}
              <Badge kind={statusKind(p)}>{statusLabel(p)}</Badge>
            </div>
            <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', margin: '0 0 8px' }}>{p.body}</p>
            {p.answers.map((a) => (
              <div key={a.id} style={{ background: 'var(--fill,#f6f8fa)', borderRadius: 8, padding: 8, marginBottom: 6, fontSize: 13 }}>
                <b>{a.teacherName}</b>{a.accepted && <Badge kind="done">채택</Badge>}<div style={{ whiteSpace: 'pre-wrap', marginTop: 2 }}>{a.body}</div>
              </div>
            ))}
          </Card>
        ))
      )}
    </div>
  );
}
