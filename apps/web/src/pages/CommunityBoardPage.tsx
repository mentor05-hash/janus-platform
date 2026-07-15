import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, EmptyState } from '../components/ui';
import { TextareaField, TextField, SelectField } from '../components/ui';

// Q3 커뮤니티(3부 공개 게시판) — 무료·전원 답변(학생 포함)·무정산·단일 채택·신고 숨김.
type ListItem = {
  id: string; subject: string | null; difficulty: string | null; body: string;
  status: string; createdAt: string; answerCount: number; hasAiDraft: boolean;
};
type Answer = {
  id: string; body: string; accepted: boolean; aiSimilar: boolean;
  authorName: string; authorRole: string | null; mine: boolean; createdAt: string;
};
type Detail = {
  id: string; subject: string | null; difficulty: string | null; body: string; status: string;
  isOwner: boolean; aiDraft: string | null; createdAt: string; answers: Answer[];
};

type TierRule = { minAuthored: number; minAccepted: number; minRate: number };
type MyLeague = {
  tier: number; label: string; authored: number; accepted: number; acceptRate: number;
  next: { tier: number; label: string; rule: TierRule } | null;
};
type LeaderRow = { tier: number; label: string; name: string; role: string | null; accepted: number; authored: number; acceptRate: number };

const fmtDate = (s: string) => { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const DIFFS = ['', '하', '중', '상', '최상'];
const tierColor = (t: number) => (t === 1 ? '#d97706' : t === 2 ? '#2563eb' : 'var(--muted)');
const roleLabel = (r: string | null) => (r === 'teacher' ? '선생님' : r === 'student' ? '학생' : r === 'guardian' ? '학부모' : r ?? '');

export function CommunityBoardPage() {
  const { user } = useAuth();
  const [list, setList] = useState<ListItem[] | null>(null);
  const [unansweredOnly, setUnansweredOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [subjectFilter, setSubjectFilter] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const load = useCallback(() => {
    setList(null);
    const qs = new URLSearchParams();
    if (unansweredOnly) qs.set('filter', 'unanswered');
    if (subjectFilter) qs.set('subject', subjectFilter);
    if (searchApplied.trim()) qs.set('q', searchApplied.trim());
    const q = qs.toString() ? `?${qs.toString()}` : '';
    api.get<ListItem[]>(`/qna/community${q}`)
      .then(setList)
      .catch((e) => setError(e instanceof ApiError ? e.message : '커뮤니티 조회 실패'));
  }, [unansweredOnly, subjectFilter, searchApplied]);

  useEffect(() => { load(); }, [load]);

  // ── 질문 등록(학생) ── (실력진단 처방 등에서 ?subject= 로 프리필)
  const [params] = useSearchParams();
  const paramSubject = params.get('subject') ?? '';
  const [showForm, setShowForm] = useState(!!paramSubject && user?.role === 'student');
  const [form, setForm] = useState({ subject: paramSubject, difficulty: '', body: '' });
  const [posting, setPosting] = useState(false);
  async function submitQuestion() {
    if (!form.body.trim()) { setError('질문 내용을 입력해 주세요.'); return; }
    setPosting(true); setError(''); setMsg('');
    try {
      await api.post('/qna/community', { subject: form.subject || undefined, difficulty: form.difficulty || undefined, body: form.body });
      setForm({ subject: '', difficulty: '', body: '' }); setShowForm(false);
      setMsg('질문을 등록했어요. AI 1차 초안이 곧 붙어요.');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '등록 실패');
    } finally { setPosting(false); }
  }

  async function report(targetType: 'post' | 'answer', targetId: string) {
    setError(''); setMsg('');
    try { await api.post('/qna/report', { targetType, targetId }); setMsg('신고했습니다.'); }
    catch (e) { setError(e instanceof ApiError ? e.message : '신고 실패'); }
  }

  if (openId) {
    return <CommunityDetail postId={openId} onBack={() => { setOpenId(null); load(); }} onReport={report} />;
  }

  return (
    <div>
      <PageHeader title="커뮤니티 게시판" sub="무료 공개 질문 — 누구나(학생 포함) 답변할 수 있어요. AI 1차 초안이 함께 제공돼요." />
      <ErrorText>{error}</ErrorText>
      {msg && <div style={{ fontSize: 13, color: 'var(--brand)', marginBottom: 8 }}>{msg}</div>}
      <LeaguePanel />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        {user?.role === 'student' && (
          <Button onClick={() => setShowForm((v) => !v)}>{showForm ? '닫기' : '＋ 질문하기'}</Button>
        )}
        <label style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          <input type="checkbox" checked={unansweredOnly} onChange={(e) => setUnansweredOnly(e.target.checked)} /> 미답변만
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <form onSubmit={(e) => { e.preventDefault(); setSearchApplied(searchQ); }} style={{ display: 'flex', gap: 6, flex: 1, minWidth: 200 }}>
          <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="검색 (과목·내용)" className="input" style={{ flex: 1 }} />
          <Button onClick={() => setSearchApplied(searchQ)}>검색</Button>
          {searchApplied && <button type="button" onClick={() => { setSearchQ(''); setSearchApplied(''); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>}
        </form>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['', '국어', '수학', '영어', '탐구'].map((sub) => (
            <button key={sub || 'all'} type="button" onClick={() => setSubjectFilter(sub)} style={{
              fontSize: 12.5, fontWeight: 700, padding: '6px 11px', borderRadius: 999, cursor: 'pointer',
              border: `1px solid ${subjectFilter === sub ? 'var(--j-blue)' : 'var(--line-soft)'}`,
              background: subjectFilter === sub ? 'var(--j-blue)' : 'transparent',
              color: subjectFilter === sub ? '#fff' : 'var(--muted)',
            }}>{sub || '전체'}</button>
          ))}
        </div>
      </div>

      {showForm && user?.role === 'student' && (
        <Card>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>커뮤니티 질문 등록 <span style={{ fontSize: 12, color: 'var(--caption)' }}>(무료 · 하루 3건)</span></h3>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <TextField label="과목" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="예: 수학" />
              <SelectField label="난이도" value={form.difficulty} onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))}
                options={DIFFS.map((v) => ({ value: v, label: v || '선택 안 함' }))} />
            </div>
            <TextareaField label="질문 내용" value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={4} placeholder="궁금한 점을 자세히 적어주세요." />
            <div><Button onClick={submitQuestion} disabled={posting}>{posting ? '등록 중…' : '등록'}</Button></div>
          </div>
        </Card>
      )}

      {list === null ? <Spinner /> : list.length === 0 ? (
        <EmptyState>{unansweredOnly ? '미답변 질문이 없어요.' : '아직 등록된 질문이 없어요.'}</EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {list.map((q) => (
            <div key={q.id} onClick={() => setOpenId(q.id)} style={{ cursor: 'pointer' }}>
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                  {q.subject && <Badge kind="new">{q.subject}</Badge>}
                  {q.difficulty && <Badge kind="soft">{q.difficulty}</Badge>}
                  {q.status === 'resolved' && <Badge kind="done">채택완료</Badge>}
                  {q.hasAiDraft && <Badge kind="soft">AI 초안</Badge>}
                  <span style={{ fontSize: 12, color: 'var(--caption)', marginLeft: 'auto' }}>답변 {q.answerCount} · {fmtDate(q.createdAt)}</span>
                </div>
                <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {q.body.length > 120 ? q.body.slice(0, 120) + '…' : q.body}
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CommunityDetail({ postId, onBack, onReport }: {
  postId: string; onBack: () => void; onReport: (t: 'post' | 'answer', id: string) => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setD(null);
    api.get<Detail>(`/qna/community/${postId}`)
      .then(setD)
      .catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, [postId]);
  useEffect(() => { load(); }, [load]);

  async function submitAnswer() {
    if (!body.trim()) return;
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await api.post<{ aiSimilar: boolean; warning: string | null }>(`/qna/community/${postId}/answers`, { body });
      setBody('');
      setMsg(r.warning ?? '답변을 등록했어요.');
      load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '답변 실패'); }
    finally { setBusy(false); }
  }

  async function accept(answerId: string) {
    setError(''); setMsg('');
    try { await api.patch(`/qna/community/answers/${answerId}/accept`, {}); setMsg('답변을 채택했어요.'); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '채택 실패'); }
  }

  if (d === null) return <Spinner />;
  const closed = d.status !== 'open';

  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0, marginBottom: 12, fontSize: 13 }}>← 목록으로</button>
      <ErrorText>{error}</ErrorText>
      {msg && <div style={{ fontSize: 13, color: 'var(--brand)', marginBottom: 8 }}>{msg}</div>}

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {d.subject && <Badge kind="new">{d.subject}</Badge>}
          {d.difficulty && <Badge kind="soft">{d.difficulty}</Badge>}
          {closed && <Badge kind="done">채택완료</Badge>}
          <button onClick={() => onReport('post', d.id)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--caption)', cursor: 'pointer', fontSize: 12 }}>🚩 신고</button>
        </div>
        <div style={{ fontSize: 15, color: 'var(--ink)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{d.body}</div>
        {d.aiDraft && (
          <div style={{ marginTop: 12, padding: 12, background: 'var(--surface-soft, #f6f7f9)', borderRadius: 8, borderLeft: '3px solid var(--brand)' }}>
            <div style={{ fontSize: 12, color: 'var(--brand)', fontWeight: 700, marginBottom: 4 }}>🤖 AI 1차 초안</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{d.aiDraft}</div>
          </div>
        )}
      </Card>

      <h3 style={{ fontSize: 15, margin: '16px 0 8px' }}>답변 {d.answers.length}</h3>
      {d.answers.length === 0 ? <EmptyState>아직 답변이 없어요. 첫 답변을 남겨보세요.</EmptyState> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {d.answers.map((a) => (
            <Card key={a.id} style={a.accepted ? { borderLeft: '3px solid var(--brand)' } : undefined}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{a.authorName}</span>
                {a.authorRole && <Badge kind="soft">{roleLabel(a.authorRole)}</Badge>}
                {a.accepted && <Badge kind="done">채택됨</Badge>}
                {a.aiSimilar && <Badge kind="danger">AI 유사</Badge>}
                <span style={{ fontSize: 12, color: 'var(--caption)', marginLeft: 'auto' }}>{fmtDate(a.createdAt)}</span>
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{a.body}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {d.isOwner && !closed && <Button onClick={() => accept(a.id)}>채택</Button>}
                {!a.mine && <button onClick={() => onReport('answer', a.id)} style={{ background: 'none', border: 'none', color: 'var(--caption)', cursor: 'pointer', fontSize: 12 }}>🚩 신고</button>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {!closed && !d.isOwner && (
        <Card style={{ marginTop: 16 }}>
          <TextareaField label="답변 작성" value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="도움이 될 답변을 적어주세요. AI 도움을 받았다면 'AI 참고'라고 표기해 주세요." />
          <div style={{ marginTop: 8 }}><Button onClick={submitAnswer} disabled={busy}>{busy ? '등록 중…' : '답변 등록'}</Button></div>
        </Card>
      )}
      {d.isOwner && !closed && <div style={{ fontSize: 13, color: 'var(--caption)', marginTop: 12 }}>본인 질문에는 답변할 수 없어요. 마음에 드는 답변을 채택해 주세요.</div>}
    </div>
  );
}

// 리그(3부→2부→1부) — 내 등급·진행도 + 상위 리더보드.
function LeaguePanel() {
  const [me, setMe] = useState<MyLeague | null>(null);
  const [board, setBoard] = useState<LeaderRow[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get<MyLeague>('/qna/league/me').then(setMe).catch(() => { /* 무시 */ });
    api.get<LeaderRow[]>('/qna/league/leaderboard').then(setBoard).catch(() => { /* 무시 */ });
  }, []);

  if (!me) return null;
  const need = me.next?.rule;
  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: tierColor(me.tier) }}>🏅 {me.label}</span>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>답변 {me.authored} · 채택 {me.accepted} · 채택률 {me.acceptRate}%</span>
        <button onClick={() => setOpen((v) => !v)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: 12.5 }}>
          리더보드 {open ? '접기' : '보기'}
        </button>
      </div>
      {me.next && need && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--muted)' }}>
          다음 <b style={{ color: tierColor(me.next.tier) }}>{me.next.label}</b>까지 —
          채택 <b>{me.accepted}/{need.minAccepted}</b> · 답변 <b>{me.authored}/{need.minAuthored}</b> · 채택률 <b>{me.acceptRate}/{need.minRate}%</b>
        </div>
      )}
      {!me.next && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--muted)' }}>최고 등급이에요. 커뮤니티의 든든한 답변자!</div>}
      {open && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--line-soft)', paddingTop: 10 }}>
          {board === null || board.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--caption)' }}>아직 승급자가 없어요. 답변으로 첫 승급을 노려보세요.</div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {board.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ width: 20, color: 'var(--caption)', fontFamily: 'var(--j-font-mono)' }}>{i + 1}</span>
                  <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.name}</span>
                  <Badge kind="soft">{r.label}</Badge>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>채택 {r.accepted} · {r.acceptRate}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
