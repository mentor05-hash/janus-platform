import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, EmptyState, TextareaField } from '../components/ui';
import { AuthImage } from '../components/AuthImage';
import { AnswerBoard } from '../components/AnswerBoard';

type Attachment = { id: string; name: string; type?: string };
type Followup = { id: string; byTeacher: boolean; body: string; createdAt: string };
type Answer = { id: string; body: string; accepted: boolean; teacherName: string; teacherId?: string | null; createdAt: string ; attachments?: Attachment[]; followups?: Followup[] };
type Post = { id: string; subject: string | null; difficulty: string | null; scope: string; assignedTeacherId: string | null; body: string; status: string; created_at: string; aiDraft?: string | null; attachments?: Attachment[]; answers: Answer[] };

const isImage = (a: Attachment) => (a.type ?? '').startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/i.test(a.name);
/** 학생이 첨부한 문제 이미지 — 클릭 시 확대(라이트박스). */
function QImages({ atts }: { atts?: Attachment[] }) {
  const imgs = (atts ?? []).filter(isImage);
  if (!imgs.length) return null;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 10px' }}>
      {imgs.map((a) => <AuthImage key={a.id} fileId={a.id} alt={a.name} size={110} />)}
      <span style={{ fontSize: 11, color: 'var(--caption)', alignSelf: 'flex-end' }}>이미지를 누르면 확대됩니다</span>
    </div>
  );
}

const statusLabel = (p: Post) => (p.status === 'resolved' ? '채택완료' : p.answers.length > 0 ? '답변완료' : '답변대기');
const statusKind = (p: Post) => (p.status === 'resolved' ? 'done' : p.answers.length > 0 ? 'confirmed' : 'new') as 'new';

function AnswerList({ answers, myId, fuDraft, setFuDraft, onFollowup }: {
  answers: Answer[]; myId?: string;
  fuDraft?: Record<string, string>; setFuDraft?: (fn: (d: Record<string, string>) => Record<string, string>) => void;
  onFollowup?: (answerId: string) => void;
}) {
  if (!answers.length) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      {answers.map((a) => (
        <div key={a.id} style={{ background: 'var(--fill,#f4f7fb)', borderRadius: 8, padding: 8, marginBottom: 6, fontSize: 13 }}>
          <b>{a.teacherName}</b>{a.accepted && <Badge kind="done">채택</Badge>}<div style={{ whiteSpace: 'pre-wrap', marginTop: 2 }}>{a.body}</div>
          {(a.attachments ?? []).length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              {(a.attachments ?? []).map((f) => <AuthImage key={f.id} fileId={f.id} alt={f.name} size={140} />)}
            </div>
          )}
          {/* C2 후속 문답 스레드 */}
          {(a.followups ?? []).map((fu) => (
            <div key={fu.id} style={{ marginTop: 6, marginLeft: 12, padding: '5px 10px', borderLeft: '3px solid var(--line)' }}>
              <b style={{ fontSize: 12, color: fu.byTeacher ? 'var(--teal)' : 'var(--muted)' }}>{fu.byTeacher ? '나(선생님)' : '학생'}</b>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: 2 }}>{fu.body}</div>
            </div>
          ))}
          {onFollowup && myId && a.teacherId === myId && (a.followups ?? []).some((fu) => !fu.byTeacher) && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, marginLeft: 12 }}>
              <input value={fuDraft?.[a.id] ?? ''} onChange={(e) => setFuDraft?.((d) => ({ ...d, [a.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) onFollowup(a.id); }}
                placeholder="학생의 추가 질문에 이어서 답하기"
                style={{ flex: 1, border: '1px solid var(--input-border)', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
              <Button size="sm" disabled={!(fuDraft?.[a.id] ?? '').trim()} onClick={() => onFollowup(a.id)}>답하기</Button>
            </div>
          )}
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

  const [fuDraft, setFuDraft] = useState<Record<string, string>>({}); // C2 — 후속 응답 초안
  async function sendFollowup(answerId: string) {
    const body = (fuDraft[answerId] ?? '').trim();
    if (!body) return;
    setError(''); setMsg('');
    try {
      const r = await api.post<{ moderationWarning?: string | null }>(`/qna/answers/${answerId}/followups`, { body });
      setMsg(r.moderationWarning ? `응답을 보냈어요. ⚠️ ${r.moderationWarning}` : '응답을 보냈어요.');
      setFuDraft((d) => ({ ...d, [answerId]: '' })); load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '전송 실패'); }
  }

  const [boardFor, setBoardFor] = useState<Post | null>(null); // P4 — 필기로 풀이 대상 질문
  const [ansAtts, setAnsAtts] = useState<Record<string, Attachment[]>>({}); // 질문별 답변 첨부(보드 PNG)

  /** P4: 필기 보드 확정 → 업로드 → 답변 첨부 목록에 추가. */
  async function attachBoardPng(post: Post, png: Blob) {
    setBoardFor(null);
    try {
      const form = new FormData();
      form.append('file', png, `solution-${new Date().toISOString().slice(0, 10)}.png`);
      const r = await api.upload<{ id: string }>('/files', form);
      setAnsAtts((m) => ({ ...m, [post.id]: [...(m[post.id] ?? []), { id: r.id, name: '필기 풀이', type: 'image/png' }].slice(0, 3) }));
      setMsg('필기 풀이가 답변에 첨부됐습니다. 답변 등록을 눌러 전송하세요.');
    } catch { setError('필기 풀이 업로드에 실패했어요.'); }
  }

  async function answer(id: string) {
    const atts = ansAtts[id] ?? [];
    const body = (draft[id] ?? '').trim() || (atts.length ? '필기 풀이를 확인해 주세요.' : '');
    if (!body) return;
    setBusy(id); setError(''); setMsg('');
    try {
      const r = await api.post<{ simFlagged?: boolean; simSummary?: string; moderationWarning?: string | null }>(`/qna/posts/${id}/answers`, { body, ...(atts.length ? { attachments: atts } : {}) });
      const base2 = r?.simFlagged ? `답변 등록됨 — ⚠️ ${r.simSummary}` : '답변이 등록되었습니다.';
      setMsg(r?.moderationWarning ? `${base2} ⚠️ ${r.moderationWarning}` : base2);
      setDraft((d) => ({ ...d, [id]: '' })); setAnsAtts((m) => ({ ...m, [id]: [] })); load();
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
            <QImages atts={p.attachments} />
            <AnswerList answers={p.answers} myId={user?.id} fuDraft={fuDraft} setFuDraft={setFuDraft} onFollowup={sendFollowup} />
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
            <QImages atts={p.attachments} />
            <AnswerList answers={p.answers} myId={user?.id} fuDraft={fuDraft} setFuDraft={setFuDraft} onFollowup={sendFollowup} />
            {p.aiDraft && (
              <div style={{ background: 'var(--teal-50,#EEF4FB)', border: '1px solid var(--input-border)', borderRadius: 8, padding: 10, margin: '4px 0 8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <b style={{ fontSize: 12, color: 'var(--teal)' }}>✦ AI 초안 <span style={{ fontWeight: 400, color: 'var(--muted)' }}>· 검토 후 보완/수정</span></b>
                  <Button size="sm" onClick={() => setDraft((d) => ({ ...d, [p.id]: p.aiDraft ?? '' }))}>이 초안으로 시작</Button>
                </div>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--ink)' }}>{p.aiDraft}</div>
              </div>
            )}
            <TextareaField label="답변 작성" rows={3} value={draft[p.id] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value }))} placeholder="풀이·설명을 작성하세요." />
            {(ansAtts[p.id] ?? []).length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0' }}>
                {(ansAtts[p.id] ?? []).map((a, i) => (
                  <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <AuthImage fileId={a.id} alt={a.name} size={72} />
                    <button type="button" onClick={() => setAnsAtts((m) => ({ ...m, [p.id]: (m[p.id] ?? []).filter((_, j) => j !== i) }))} title="첨부 제거"
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }}>✕</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => answer(p.id)} disabled={busy === p.id || (!(draft[p.id] ?? '').trim() && (ansAtts[p.id] ?? []).length === 0)}>답변 등록</Button>
              <Button variant="ghost" onClick={() => setBoardFor(p)} disabled={(ansAtts[p.id] ?? []).length >= 3} title="질문 사진 위에 풀이를 필기해 이미지로 첨부">🖊 필기로 풀이</Button>
            </div>
          </Card>
        ))
      )}

      {boardFor && (
        <AnswerBoard
          bgFileId={(boardFor.attachments ?? []).find((a) => (a.type ?? '').startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(a.name))?.id ?? null}
          onDone={(png) => void attachBoardPng(boardFor, png)}
          onClose={() => setBoardFor(null)}
        />
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
            <QImages atts={p.attachments} />
            <AnswerList answers={p.answers} myId={user?.id} fuDraft={fuDraft} setFuDraft={setFuDraft} onFollowup={sendFollowup} />
          </Card>
        ))
      )}
    </div>
  );
}
