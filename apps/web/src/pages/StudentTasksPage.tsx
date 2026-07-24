import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Spinner, EmptyState, ErrorText, Button } from '../components/ui';

export type StudentTask = {
  id: string;
  title: string;
  category: string;
  subject: string | null;
  due_date: string | null;
  status: 'todo' | 'done' | 'dismissed';
  cta_href: string | null;
  created_by: string;
  done_at: string | null;
};

const CAT: Record<string, { label: string; icon: string; color: string }> = {
  gap: { label: '약점', icon: '🎯', color: '#d06b52' },
  academic: { label: '학사', icon: '📅', color: '#2F6FB3' },
  consult: { label: '상담', icon: '🧭', color: '#57a86a' },
  qna: { label: '질문', icon: '❓', color: '#CF9A3A' },
  custom: { label: '직접', icon: '📌', color: '#64748B' },
};
const catOf = (c: string) => CAT[c] ?? CAT.custom;
const dday = (d: string | null) => {
  if (!d) return null;
  const t0 = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }));
  const diff = Math.round((new Date(d.slice(0, 10)).getTime() - t0.getTime()) / 86400000);
  return diff === 0 ? 'D-DAY' : diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
};

/** 맞춤 할 일 — 격차·학사일정 자동 제안 + 수동. 진단→실행. */
export function StudentTasksPage() {
  const [tasks, setTasks] = useState<StudentTask[] | null>(null);
  const [error, setError] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get<StudentTask[]>('/me/tasks').then(setTasks).catch((e) => { setError(e instanceof ApiError ? e.message : '조회 실패'); setTasks([]); });
  useEffect(() => { load(); }, []);

  async function toggle(t: StudentTask) {
    setTasks((p) => p && p.map((x) => (x.id === t.id ? { ...x, status: t.status === 'done' ? 'todo' : 'done' } : x)));
    await api.patch(`/me/tasks/${t.id}`, { status: t.status === 'done' ? 'todo' : 'done' }).catch(() => load());
  }
  async function remove(t: StudentTask) {
    setTasks((p) => p && p.filter((x) => x.id !== t.id));
    await api.del(`/me/tasks/${t.id}`).catch(() => load());
  }
  async function add() {
    if (!newTitle.trim()) return;
    setBusy(true);
    try { await api.post('/me/tasks', { title: newTitle.trim() }); setNewTitle(''); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '추가 실패'); } finally { setBusy(false); }
  }

  const todo = (tasks ?? []).filter((t) => t.status === 'todo');
  const done = (tasks ?? []).filter((t) => t.status === 'done');

  const Row = ({ t }: { t: StudentTask }) => {
    const c = catOf(t.category);
    const dl = dday(t.due_date);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
        <input type="checkbox" checked={t.status === 'done'} onChange={() => toggle(t)} aria-label={`${t.title} 완료`} style={{ width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: c.color, background: 'var(--surface-2, #f0f3f7)', borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>{c.icon} {c.label}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, color: t.status === 'done' ? 'var(--muted)' : 'var(--ink)', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</div>
          {dl && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{dl} · {t.due_date?.slice(0, 10)}</div>}
        </div>
        {t.cta_href && t.status !== 'done' && <Link to={t.cta_href} className="btn ghost sm" style={{ whiteSpace: 'nowrap' }}>바로가기 →</Link>}
        <button onClick={() => remove(t)} aria-label="삭제" title="삭제/숨김" style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>✕</button>
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="할 일" sub="격차 리포트가 찾은 약점과 다가오는 학사일정에서 자동으로 제안돼요. 직접 추가도 가능해요." />
      <ErrorText>{error}</ErrorText>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="직접 할 일 추가 (예: 수학 오답노트 정리)" aria-label="새 할 일"
            style={{ flex: 1, padding: '9px 11px', border: '1px solid var(--input-border, #cbd5da)', borderRadius: 8, fontSize: 14, background: 'var(--surface)', color: 'var(--ink)' }} />
          <Button onClick={add} disabled={busy || !newTitle.trim()}>추가</Button>
        </div>
      </Card>

      {tasks === null ? <Spinner /> : todo.length === 0 && done.length === 0 ? (
        <Card><EmptyState>할 일이 없어요. 성적·목표가 입력되면 약점 과목이 자동으로 제안돼요.</EmptyState></Card>
      ) : (
        <>
          <Card title={`할 일 (${todo.length})`} style={{ marginBottom: 12 }}>
            {todo.length === 0 ? <EmptyState>모두 완료했어요! 👏</EmptyState> : todo.map((t) => <Row key={t.id} t={t} />)}
          </Card>
          {done.length > 0 && (
            <Card title={`완료 (${done.length})`}>
              {done.map((t) => <Row key={t.id} t={t} />)}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
