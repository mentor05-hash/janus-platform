import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isHq } from '../auth/roleHome';
import { PageHeader, Card, Spinner, EmptyState, ErrorText, Badge } from '../components/ui';
import { ACA_TYPES, acaMeta, acaDateLabel, groupByMonth, type AcademicEvent } from '../lib/academic';
import { AcademicCalendar } from '../components/AcademicCalendar';

const GRADES = ['전체', '고1', '고2', '고3', '재수'];
const empty = { title: '', type: 'mock', startDate: '', endDate: '', grade: '고3', description: '' };

/** 학사일정 관리(관리자) — 수능·모의고사·신청기간·내신 등록/수정/삭제. */
export function AdminAcademicPage() {
  const { user } = useAuth();
  const hq = isHq(user);
  const [events, setEvents] = useState<AcademicEvent[] | null>(null);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [loadFailed, setLoadFailed] = useState(false);

  const load = () => {
    api.get<AcademicEvent[]>('/admin/academic-events').then((r) => { setEvents(Array.isArray(r) ? r : []); setLoadFailed(false); }).catch(() => { setLoadFailed(true); setEvents([]); });
  };
  useEffect(load, []);

  const reset = () => { setForm(empty); setEditId(null); };

  async function submit() {
    if (!form.title.trim() || !form.startDate) { setError('제목과 시작일은 필수예요.'); return; }
    setBusy(true); setError('');
    try {
      const body = {
        title: form.title.trim(), type: form.type, startDate: form.startDate,
        endDate: form.endDate || null, grade: form.grade || null, description: form.description || null,
      };
      if (editId) await api.patch(`/admin/academic-events/${editId}`, body);
      else await api.post('/admin/academic-events', body);
      reset(); load();
    } catch (e) { setError(e instanceof ApiError ? e.message : '저장 실패'); } finally { setBusy(false); }
  }

  function edit(e: AcademicEvent) {
    setEditId(e.id);
    setForm({ title: e.title, type: e.type, startDate: e.start_date.slice(0, 10), endDate: e.end_date?.slice(0, 10) ?? '', grade: e.grade ?? '', description: e.description ?? '' });
  }

  async function remove(id: string) {
    if (!confirm('이 일정을 삭제할까요?')) return;
    try { await api.del(`/admin/academic-events/${id}`); if (editId === id) reset(); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '삭제 실패'); }
  }

  const groups = events ? groupByMonth(events) : [];
  const fld: React.CSSProperties = { padding: '9px 11px', border: '1px solid var(--input-border, #cbd5da)', borderRadius: 8, fontSize: 14, background: 'var(--surface)', color: 'var(--ink)' };

  return (
    <div>
      <PageHeader title="학사일정" sub={`수능·모의고사·신청기간·내신 등 월별 중요일정. ${hq ? '본사 등록 = 전국 공통' : '센터 등록 = 우리 센터 학생·학부모에게 노출'}`} />
      <ErrorText>{error}</ErrorText>

      <Card title={editId ? '일정 수정' : '일정 등록'} style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>제목</span>
            <input style={fld} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="예: 2027학년도 대학수학능력시험" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>유형</span>
            <select style={fld} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {ACA_TYPES.map((t) => <option key={t} value={t}>{acaMeta(t).icon} {acaMeta(t).label}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>대상 학년</span>
            <select style={fld} value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>시작일</span>
            <input type="date" style={fld} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>종료일 (기간이면)</span>
            <input type="date" style={fld} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>설명 (선택)</span>
            <input style={fld} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="안내 문구·유의사항" />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn" onClick={submit} disabled={busy}>{busy ? '저장 중…' : editId ? '수정 저장' : '등록'}</button>
          {editId && <button className="btn ghost" onClick={reset}>취소</button>}
        </div>
      </Card>

      <div style={{ display: 'inline-flex', gap: 2, padding: 3, background: 'var(--surface-2, #f0f3f7)', borderRadius: 9, marginBottom: 12 }}>
        {([['list', '목록'], ['calendar', '달력']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} style={{ border: 'none', cursor: 'pointer', padding: '6px 16px', borderRadius: 7, fontSize: 13, fontWeight: 700, background: view === k ? 'var(--surface)' : 'transparent', color: view === k ? 'var(--teal)' : 'var(--muted)', boxShadow: view === k ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>{l}</button>
        ))}
      </div>

      {events === null ? <Spinner /> : loadFailed ? (
        <Card><EmptyState>학사일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</EmptyState></Card>
      ) : view === 'calendar' ? (
        <Card><AcademicCalendar events={events} onPick={(e) => { edit(e); window.scrollTo({ top: 0, behavior: 'smooth' }); }} /></Card>
      ) : groups.length === 0 ? (
        <Card><EmptyState>등록된 학사일정이 없어요. 위에서 첫 일정을 등록해 보세요.</EmptyState></Card>
      ) : groups.map((g) => (
        <Card key={g.key} title={g.label} style={{ marginBottom: 12 }}>
          {g.items.map((e) => {
            const m = acaMeta(e.type);
            return (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: 20 }}>{m.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{e.title}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                    <span style={{ color: m.color, fontWeight: 700 }}>{m.label}</span> · {acaDateLabel(e)}{e.grade ? ` · ${e.grade}` : ''}
                    {' · '}<Badge kind={e.center_id ? 'soft' : 'new'}>{e.center_id ? '우리 센터' : '전국'}</Badge>
                  </div>
                </div>
                <button className="btn ghost sm" onClick={() => edit(e)}>수정</button>
                <button className="btn ghost sm" onClick={() => remove(e.id)} style={{ color: 'var(--chip-danger)' }}>삭제</button>
              </div>
            );
          })}
        </Card>
      ))}
    </div>
  );
}
