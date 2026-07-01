import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, EmptyState, TextareaField } from '../components/ui';

type Answer = { id: string; body: string; accepted: boolean; teacherName: string; createdAt: string };
type Post = { id: string; subject: string | null; difficulty: string | null; scope: string; assignedTeacherId: string | null; body: string; status: string; created_at: string; answers: Answer[] };

const statusLabel = (p: Post) => (p.status === 'resolved' ? '채택완료' : p.answers.length > 0 ? '답변완료' : '답변대기');
const statusKind = (p: Post) => (p.status === 'resolved' ? 'done' : p.answers.length > 0 ? 'confirmed' : 'new') as 'new';

function AnswerList({ answers }: { answers: Answer[] }) {
  if (!answers.length) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      {answers.map((a) => (
        <div key={a.id} style={{ background: 'var(--fill,#f6f8fa)', borderRadius: 8, padding: 8, marginBottom: 6, fontSize: 13 }}>
          <b>{a.teacherName}</b>{a.accepted && <Badge kind="done">채택</Badge>}<div style={{ whiteSpace: 'pre-wrap', marginTop: 2 }}>{a.body}</div>
        </div>
      ))}
    </div>
  );
}

export function TeacherQnaPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() { api.get<Post[]>('/qna/posts').then(setPosts).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패')); }
  useEffect(load, []);

  async function claim(id: string) {
    setBusy(id); setError(''); setMsg('');
    try {
      await api.post(`/qna/posts/${id}/claim`, {});
      setMsg('공개질문을 가져왔어요. 이제 답변을 작성할 수 있어요.'); load();
    } catch (e) { setError(e instanceof ApiError ? (e.status === 409 ? '다른 선생님이 먼저 가져갔어요.' : e.message) : '가져오기 실패'); load(); } finally { setBusy(null); }
  }

  async function answer(id: string) {
    const body = (draft[id] ?? '').trim();
    if (!body) return;
    setBusy(id); setError(''); setMsg('');
    try {
      await api.post(`/qna/posts/${id}/answers`, { body });
      setMsg('답변이 등록되었습니다.'); setDraft((d) => ({ ...d, [id]: '' })); load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '답변 실패'); } finally { setBusy(null); }
  }

  const all = posts ?? [];
  const claimable = all.filter((p) => p.status === 'open' && p.scope === 'open');
  const mine = all.filter((p) => p.status === 'open' && p.scope === 'assigned' && p.assignedTeacherId === user?.id);
  const rest = all.filter((p) => p.status !== 'open');
  const head = (p: Post) => (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
      {p.subject && <Badge kind="soft">{p.subject}</Badge>}
      <Badge kind="soft">{p.scope === 'open' ? '공개' : '지정'}</Badge>
      {p.difficulty && <Badge kind="soft">난이도 {p.difficulty}</Badge>}
      <Badge kind={statusKind(p)}>{statusLabel(p)}</Badge>
      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>{new Date(p.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</span>
    </div>
  );

  return (
    <div>
      <PageHeader title="질문 답변 (공개질문 큐)" sub="공개질문은 먼저 '답변 가져오기'로 선착순 배정받은 뒤 답변합니다. 지정 질문은 바로 답변할 수 있어요." />
      {error && <ErrorText>{error}</ErrorText>}
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}

      <h3 style={{ fontSize: 15, margin: '8px 0' }}>공개질문 큐 (선착순) {claimable.length > 0 && <Badge kind="new">{claimable.length}</Badge>}</h3>
      {posts === null ? <Spinner /> : claimable.length === 0 ? <Card><EmptyState>가져올 공개질문이 없어요.</EmptyState></Card> : (
        claimable.map((p) => (
          <Card key={p.id} style={{ marginBottom: 8 }}>
            {head(p)}
            <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', margin: '0 0 10px' }}>{p.body}</p>
            <AnswerList answers={p.answers} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Button onClick={() => claim(p.id)} disabled={busy === p.id}>답변 가져오기</Button>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>⚡ 먼저 가져가는 선생님에게 배정됩니다.</span>
            </div>
          </Card>
        ))
      )}

      <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>내가 맡은 질문 {mine.length > 0 && <Badge kind="confirmed">{mine.length}</Badge>}</h3>
      {posts === null ? null : mine.length === 0 ? <Card><EmptyState>가져오거나 지정된 질문이 없어요.</EmptyState></Card> : (
        mine.map((p) => (
          <Card key={p.id} style={{ marginBottom: 8 }}>
            {head(p)}
            <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', margin: '0 0 10px' }}>{p.body}</p>
            <AnswerList answers={p.answers} />
            <TextareaField label="답변 작성" rows={3} value={draft[p.id] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value }))} placeholder="풀이·설명을 작성하세요." />
            <Button onClick={() => answer(p.id)} disabled={busy === p.id || !(draft[p.id] ?? '').trim()}>답변 등록</Button>
          </Card>
        ))
      )}

      <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>답변 완료 / 마감</h3>
      {posts === null ? null : rest.length === 0 ? <Card><EmptyState>없음</EmptyState></Card> : (
        rest.map((p) => (
          <Card key={p.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              {p.subject && <Badge kind="soft">{p.subject}</Badge>}
              <Badge kind={statusKind(p)}>{statusLabel(p)}</Badge>
            </div>
            <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', margin: '0 0 8px' }}>{p.body}</p>
            <AnswerList answers={p.answers} />
          </Card>
        ))
      )}
    </div>
  );
}
