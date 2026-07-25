import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Spinner, EmptyState, ErrorText, Button, TextField } from '../components/ui';

/**
 * 학부모 계획 트랙(O106) — 내 공간에서 자녀 계획을 세우고 '제안'하면 자녀가 수락/거절한다.
 *
 * 자녀 계획을 **직접 고치지 않는다**: 제안 → 자녀 수락 시에만 자녀 할 일이 된다(학생 자율성).
 * 연령 권한(O105): 미성년 자녀는 바로 제안 가능 / 성인 자녀는 **자녀 본인의 동의**가 있어야 제안된다.
 */
type Child = { studentId: string; name: string };
type Status = 'draft' | 'proposed' | 'accepted' | 'declined';
type PlanItem = {
  id: string; title: string; subject: string | null; due_date: string | null; note: string | null;
  status: Status; proposed_at: string | null; responded_at: string | null;
};

const STATUS_META: Record<Status, { label: string; color: string; desc: string }> = {
  draft: { label: '내 메모', color: 'var(--muted)', desc: '아직 자녀에게 보이지 않아요' },
  proposed: { label: '제안 중', color: '#2F6FB3', desc: '자녀의 응답을 기다려요' },
  accepted: { label: '수락됨', color: '#2a8a5f', desc: '자녀 할 일에 추가됐어요' },
  declined: { label: '거절됨', color: '#d06b52', desc: '자녀가 받지 않았어요' },
};
const D = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '—');

export function GuardianPlanPage() {
  const [children, setChildren] = useState<Child[] | null>(null);
  const [sel, setSel] = useState('');
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [form, setForm] = useState({ title: '', subject: '', dueDate: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get<Child[]>('/guardian/children')
      .then((cs) => { setChildren(cs); if (cs[0]) setSel(cs[0].studentId); })
      .catch(() => setChildren([]));
  }, []);

  const load = useCallback(async (studentId: string) => {
    setErr('');
    try { setItems(await api.get<PlanItem[]>(`/guardian/plan?studentId=${encodeURIComponent(studentId)}`)); }
    catch (e) { setErr(e instanceof ApiError ? e.message : '조회 실패'); setItems([]); }
  }, []);
  useEffect(() => { if (sel) void load(sel); }, [sel, load]);

  async function add() {
    if (!form.title.trim()) { setErr('계획 제목을 입력하세요.'); return; }
    setBusy(true); setErr(''); setMsg('');
    try {
      await api.post(`/guardian/plan?studentId=${encodeURIComponent(sel)}`, {
        title: form.title.trim(), subject: form.subject.trim() || null, dueDate: form.dueDate || null,
      });
      setForm({ title: '', subject: '', dueDate: '' });
      setMsg('계획을 추가했어요. 준비되면 자녀에게 제안하세요.');
      await load(sel);
    } catch (e) { setErr(e instanceof ApiError ? e.message : '추가 실패'); }
    finally { setBusy(false); }
  }

  async function propose(id: string) {
    setBusy(true); setErr(''); setMsg('');
    try {
      await api.post(`/guardian/plan/${id}/propose`, {});
      setMsg('자녀에게 제안했어요. 자녀가 수락하면 자녀 할 일에 추가됩니다.');
      await load(sel);
    } catch (e) {
      // 성인 자녀인데 동의가 없으면 여기서 사유가 온다(O105 — NEED_STUDENT_CONSENT).
      setErr(e instanceof ApiError ? e.message : '제안 실패');
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    setBusy(true); setErr(''); setMsg('');
    try { await api.del(`/guardian/plan/${id}`); await load(sel); }
    catch (e) { setErr(e instanceof ApiError ? e.message : '삭제 실패'); }
    finally { setBusy(false); }
  }

  if (children === null) return <div><PageHeader title="자녀 계획" /><Spinner /></div>;
  if (children.length === 0) {
    return (
      <div>
        <PageHeader title="자녀 계획" sub="자녀에게 학습 계획을 제안할 수 있어요." />
        <Card><EmptyState>연결된 자녀가 없어요. 자녀 계정에서 보호자 연결을 승인하면 표시됩니다.</EmptyState></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="자녀 계획"
        sub="내 공간에서 계획을 세우고 '제안'하면 자녀가 수락/거절해요. 자녀 할 일을 직접 고치지는 않아요."
      />

      {children.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {children.map((c) => (
            <button key={c.studentId} className={sel === c.studentId ? 'btn sm' : 'btn ghost sm'} onClick={() => setSel(c.studentId)}>{c.name}</button>
          ))}
        </div>
      )}

      <ErrorText>{err}</ErrorText>
      {msg && <div style={{ fontSize: 13, color: 'var(--janus-signal-stable, #2a8a5f)', marginBottom: 10 }}>{msg}</div>}

      <Card title="계획 추가" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <TextField label="계획" placeholder="예) 수학 오답노트 매일 30분" maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <TextField label="과목(선택)" placeholder="예) 수학" maxLength={30} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            <TextField label="마감일(선택)" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div><Button onClick={add} disabled={busy}>계획 추가(내 메모)</Button></div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            추가한 계획은 <b>내게만 보입니다</b>. '자녀에게 제안'을 누르면 자녀에게 전달돼요.
          </div>
        </div>
      </Card>

      <Card title="내 계획">
        {items === null ? <Spinner /> : items.length === 0 ? (
          <EmptyState>아직 계획이 없어요. 위에서 추가해 보세요.</EmptyState>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map((it) => {
              const m = STATUS_META[it.status];
              return (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: m.color, background: 'var(--surface-2, #f0f3f7)', borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>{m.label}</span>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 14, color: 'var(--ink)' }}>
                      <b>{it.title}</b>{it.subject ? <span style={{ color: 'var(--muted)' }}> · {it.subject}</span> : null}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {m.desc}
                      {it.due_date ? ` · 마감 ${D(it.due_date)}` : ''}
                      {it.proposed_at ? ` · 제안 ${D(it.proposed_at)}` : ''}
                    </div>
                  </div>
                  {it.status === 'draft' && (
                    <button className="btn sm" onClick={() => propose(it.id)} disabled={busy} data-janus-cta="guardian_plan_propose">자녀에게 제안</button>
                  )}
                  <button onClick={() => remove(it.id)} aria-label="계획 삭제" title="내 계획에서 삭제(자녀가 수락한 할 일은 그대로 남아요)"
                    style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--muted)' }}>
          제안한 계획은 자녀가 본 내용과 달라지지 않도록 수정할 수 없어요(새로 만들어 주세요).
          성인 자녀는 <b>자녀 본인의 동의</b>가 있어야 제안이 전달됩니다.
        </div>
      </Card>
    </div>
  );
}
