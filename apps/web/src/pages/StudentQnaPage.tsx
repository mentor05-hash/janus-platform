import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, EmptyState, TextareaField, SelectField } from '../components/ui';

type Post = {
  id: string;
  subject: string | null;
  difficulty: string | null;
  scope: string;
  body: string;
  status: string;
  q_type?: string | null;
  created_at: string;
};

const SUBJECTS = ['국어', '수학', '영어', '탐구'];

export function StudentQnaPage() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ subject: '수학', qType: 'general', scope: 'open', difficulty: '중', body: '' });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  function load() {
    api.get<Post[]>('/qna/posts').then(setPosts).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }
  useEffect(load, []);

  async function submit() {
    setError(''); setMsg('');
    if (!f.body.trim()) { setError('질문 내용을 입력하세요.'); return; }
    try {
      await api.post('/qna/posts', { subject: f.subject, qType: f.qType, scope: f.scope, difficulty: f.difficulty, body: f.body });
      setMsg('질문이 등록되었습니다(건당 크레딧 차감).');
      setF({ ...f, body: '' }); setOpen(false); load();
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
                <Badge kind={p.status === 'answered' || p.status === 'accepted' ? 'done' : 'confirmed'}>{p.status === 'accepted' ? '채택완료' : p.status === 'answered' ? '답변옴' : '답변대기'}</Badge>
              </div>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(p.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</span>
            </div>
            <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{p.body}</p>
          </Card>
        ))
      )}
    </div>
  );
}
