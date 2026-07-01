import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, EmptyState, TextareaField, SelectField } from '../components/ui';
import { AuthImage } from '../components/AuthImage';

type Attachment = { id: string; name: string; type?: string };
type Answer = { id: string; body: string; accepted: boolean; teacherName: string };
type Post = {
  id: string;
  subject: string | null;
  difficulty: string | null;
  scope: string;
  body: string;
  status: string;
  q_type?: string | null;
  created_at: string;
  attachments?: Attachment[];
  answers?: Answer[];
};
const isImage = (a: Attachment) => (a.type ?? '').startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/i.test(a.name);
const MAX_IMG = 3;

const SUBJECTS = ['국어', '수학', '영어', '탐구'];

export function StudentQnaPage() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ subject: '수학', qType: 'general', scope: 'open', difficulty: '중', body: '' });
  const [atts, setAtts] = useState<Attachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    setError('');
    const files = Array.from(e.target.files ?? []).filter((x) => x.type.startsWith('image/'));
    if (!files.length) return;
    const room = MAX_IMG - atts.length;
    if (room <= 0) { setError(`이미지는 최대 ${MAX_IMG}장까지 첨부할 수 있어요.`); e.target.value = ''; return; }
    for (const file of files.slice(0, room)) {
      try {
        const form = new FormData(); form.append('file', file, file.name);
        const r = await api.upload<{ id: string; filename: string; contentType: string }>('/files', form);
        setAtts((p) => [...p, { id: r.id, name: r.filename, type: r.contentType }]);
      } catch (er) { setError(er instanceof ApiError ? er.message : '이미지 업로드 실패'); }
    }
    if (files.length > room) setError(`한 문항 기준 이미지는 ${MAX_IMG}장까지만 등록됩니다.`);
    e.target.value = '';
  }

  function load() {
    api.get<Post[]>('/qna/posts').then(setPosts).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }
  useEffect(load, []);

  async function accept(answerId: string) {
    setError(''); setMsg('');
    try { await api.patch(`/qna/answers/${answerId}/accept`, {}); setMsg('답변을 채택했습니다.'); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '채택 실패'); }
  }

  async function submit() {
    setError(''); setMsg('');
    if (!f.body.trim()) { setError('질문 내용을 입력하세요.'); return; }
    try {
      await api.post('/qna/posts', { subject: f.subject, qType: f.qType, scope: f.scope, difficulty: f.difficulty, body: f.body, attachments: atts });
      setMsg('질문이 등록되었습니다(건당 크레딧 차감).');
      setF({ ...f, body: '' }); setAtts([]); setOpen(false); load();
    } catch (e) {
      setError(e instanceof ApiError ? (e.status === 402 ? '크레딧이 부족합니다.' : e.message) : '등록 실패');
    }
  }

  return (
    <div>
      <PageHeader title="질문 게시판 (Q&A)" sub="선생님에게 질문을 남기고 답변을 받습니다. 공개 질문 또는 지정 질문(건당 크레딧)." />
      <div style={{ marginBottom: 12 }}>
        <Button onClick={() => setOpen((o) => !o)}>{open ? '닫기' : '질문 작성'}</Button>
      </div>
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
      {error && <ErrorText>{error}</ErrorText>}

      {open && (
        <Card style={{ maxWidth: 640, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 120 }}><SelectField label="과목" value={f.subject} onChange={(e) => set('subject', e.target.value)} options={SUBJECTS.map((s) => ({ value: s, label: s }))} /></div>
            <div style={{ minWidth: 120 }}><SelectField label="유형" value={f.qType} onChange={(e) => set('qType', e.target.value)} options={[{ value: 'general', label: '일반' }, { value: 'item', label: '문항(고난도)' }]} /></div>
            <div style={{ minWidth: 120 }}><SelectField label="공개범위" value={f.scope} onChange={(e) => set('scope', e.target.value)} options={[{ value: 'open', label: '공개' }, { value: 'assigned', label: '지정' }]} /></div>
            <div style={{ minWidth: 100 }}><SelectField label="난이도" value={f.difficulty} onChange={(e) => set('difficulty', e.target.value)} options={['하', '중', '상'].map((d) => ({ value: d, label: d }))} /></div>
          </div>
          <TextareaField label="질문 내용" rows={4} value={f.body} onChange={(e) => set('body', e.target.value)} placeholder="예: 미적분 30번, 합성함수 미분에서 왜 이렇게 전개되나요?" />

          {/* 이미지 첨부 (문제 사진) — 최대 3장, 한 문항만 */}
          <label className="label" style={{ marginTop: 4 }}>문제 이미지 (최대 {MAX_IMG}장)</label>
          <p style={{ fontSize: 12, color: 'var(--chip-confirmed)', background: 'var(--chip-confirmed-bg,#FEF6E7)', borderRadius: 8, padding: '7px 10px', margin: '0 0 8px' }}>
            ⚠️ 한 번에 <b>한 문항만</b> 올려주세요. 여러 문항을 함께 올리면 답변이 정확하지 않을 수 있어요.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            {atts.map((a) => (
              <div key={a.id} style={{ position: 'relative' }}>
                <AuthImage fileId={a.id} alt={a.name} size={84} />
                <button type="button" onClick={() => setAtts((p) => p.filter((x) => x.id !== a.id))} title="제거"
                  style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'var(--chip-danger)', color: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: '20px', padding: 0 }}>✕</button>
              </div>
            ))}
            {atts.length < MAX_IMG && (
              <button type="button" onClick={() => fileRef.current?.click()} style={{ width: 84, height: 84, borderRadius: 8, border: '1px dashed var(--input-border)', background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>
                ＋ 사진<br />추가
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
          </div>

          <Button onClick={submit} disabled={!f.body.trim()}>질문 등록</Button>
        </Card>
      )}

      {posts === null ? <Spinner /> : posts.length === 0 ? <Card><EmptyState>등록한 질문이 없어요.</EmptyState></Card> : (
        posts.map((p) => (
          <Card key={p.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge kind="soft">{p.subject ?? '질문'}</Badge>
                <Badge kind="soft">{p.scope === 'open' ? '공개' : '지정'}</Badge>
                {p.difficulty && <Badge kind="soft">난이도 {p.difficulty}</Badge>}
                <Badge kind={p.status === 'resolved' ? 'done' : (p.answers?.length ?? 0) > 0 ? 'confirmed' : 'new'}>{p.status === 'resolved' ? '채택완료' : (p.answers?.length ?? 0) > 0 ? '답변옴' : '답변대기'}</Badge>
              </div>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(p.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</span>
            </div>
            <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', margin: '8px 0 10px' }}>{p.body}</p>
            {(p.attachments?.filter(isImage).length ?? 0) > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {p.attachments!.filter(isImage).map((a) => <AuthImage key={a.id} fileId={a.id} alt={a.name} size={92} />)}
              </div>
            )}
            {(p.answers?.length ?? 0) > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {p.answers!.map((a) => (
                  <div key={a.id} style={{ background: 'var(--fill,#f6f8fa)', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <b style={{ fontSize: 13 }}>{a.teacherName} 선생님 답변 {a.accepted && <Badge kind="done">채택</Badge>}</b>
                      {!a.accepted && p.status !== 'resolved' && <Button size="sm" onClick={() => accept(a.id)}>채택</Button>}
                    </div>
                    <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', marginTop: 4 }}>{a.body}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
