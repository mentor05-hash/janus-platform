import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';

type Target = 'teacher' | 'student' | 'guardian';
type Channel = 'app' | 'sms' | 'kakao';
const TARGETS: { k: Target; label: string }[] = [
  { k: 'teacher', label: '선생님' },
  { k: 'student', label: '학생' },
  { k: 'guardian', label: '학부모' },
];
const CHANNELS: Channel[] = ['app', 'sms', 'kakao'];

type Template = { id: string; name: string; targets: Target[]; title: string; body: string; channels: Channel[] };
type Scheduled = { id: string; title: string; targets: Target[]; scheduled_at: string; center_id: string | null };

export function AnnouncementsPage() {
  const [targets, setTargets] = useState<Set<Target>>(new Set(['student']));
  const [channels, setChannels] = useState<Set<Channel>>(new Set(['app']));
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [scheduled, setScheduled] = useState<Scheduled[]>([]);
  const [tmplName, setTmplName] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setTemplates(await api.get<Template[]>('/admin/announcement-templates'));
      setScheduled(await api.get<Scheduled[]>('/admin/announcements/scheduled'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '조회 실패');
    }
  }, []);
  useEffect(() => void load(), [load]);

  const toggle = <T,>(set: Set<T>, v: T, fn: (s: Set<T>) => void) => {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    fn(n);
  };

  const send = async () => {
    setMsg('');
    setError('');
    try {
      const dto: Record<string, unknown> = { targets: [...targets], title, body, channels: [...channels] };
      if (scheduledAt) dto.scheduledAt = new Date(scheduledAt).toISOString();
      const r = await api.post<{ sent?: number; scheduledId?: string; byTarget?: Record<string, number> }>('/admin/announcements', dto);
      setMsg(r.scheduledId ? `예약 등록됨 (${new Date(scheduledAt).toLocaleString()})` : `발송 완료 — ${r.sent}건 ${JSON.stringify(r.byTarget)}`);
      setTitle('');
      setBody('');
      setScheduledAt('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '발송 실패');
    }
  };

  const saveTemplate = async () => {
    setMsg('');
    setError('');
    try {
      await api.post('/admin/announcement-templates', { name: tmplName, targets: [...targets], title, body, channels: [...channels] });
      setTmplName('');
      setMsg('템플릿 저장됨');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '템플릿 저장 실패');
    }
  };

  const applyTemplate = (t: Template) => {
    setTargets(new Set(t.targets));
    setChannels(new Set(t.channels?.length ? t.channels : ['app']));
    setTitle(t.title);
    setBody(t.body);
  };

  const cancelScheduled = async (id: string) => {
    await api.post(`/admin/announcements/scheduled/${id}/cancel`);
    await load();
  };
  const deleteTemplate = async (id: string) => {
    await api.del(`/admin/announcement-templates/${id}`);
    await load();
  };

  const canSend = targets.size > 0 && title.trim() && body.trim();

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <h2 style={{ margin: 0 }}>공지 알림</h2>
      {msg && <div style={{ color: 'var(--teal)', fontSize: 14 }}>{msg}</div>}
      {error && <div style={{ color: '#c0392b', fontSize: 14 }}>{error}</div>}

      <section className="card" style={{ display: 'grid', gap: 12, padding: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <strong style={{ width: 60 }}>대상</strong>
          {TARGETS.map((t) => (
            <label key={t.k} style={{ fontSize: 14 }}>
              <input type="checkbox" checked={targets.has(t.k)} onChange={() => toggle(targets, t.k, setTargets)} /> {t.label}
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <strong style={{ width: 60 }}>채널</strong>
          {CHANNELS.map((c) => (
            <label key={c} style={{ fontSize: 14 }}>
              <input type="checkbox" checked={channels.has(c)} onChange={() => toggle(channels, c, setChannels)} /> {c}
            </label>
          ))}
        </div>
        <input className="input" placeholder="제목" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="input" placeholder="본문" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 14 }}>
            예약 발송: <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </label>
          <button className="btn" disabled={!canSend} onClick={send}>
            {scheduledAt ? '예약 등록' : '즉시 발송'}
          </button>
          <span style={{ flex: 1 }} />
          <input className="input" style={{ width: 160 }} placeholder="템플릿 이름" value={tmplName} onChange={(e) => setTmplName(e.target.value)} />
          <button className="btn ghost sm" disabled={!tmplName.trim() || !canSend} onClick={saveTemplate}>
            템플릿 저장
          </button>
        </div>
      </section>

      <section>
        <h3 style={{ fontSize: 15 }}>저장된 템플릿</h3>
        {templates.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>없음</p>
        ) : (
          <ul style={{ display: 'grid', gap: 6, listStyle: 'none', padding: 0 }}>
            {templates.map((t) => (
              <li key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}>
                <strong>{t.name}</strong>
                <span style={{ color: 'var(--muted)' }}>{t.title}</span>
                <span style={{ flex: 1 }} />
                <button className="btn ghost sm" onClick={() => applyTemplate(t)}>불러오기</button>
                <button className="btn ghost sm" onClick={() => deleteTemplate(t.id)}>삭제</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 style={{ fontSize: 15 }}>예약된 공지</h3>
        {scheduled.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>대기 중 없음</p>
        ) : (
          <ul style={{ display: 'grid', gap: 6, listStyle: 'none', padding: 0 }}>
            {scheduled.map((s) => (
              <li key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}>
                <span style={{ color: 'var(--muted)' }}>{new Date(s.scheduled_at).toLocaleString()}</span>
                <strong>{s.title}</strong>
                <span style={{ color: 'var(--muted)' }}>[{s.targets.join(',')}]</span>
                <span style={{ flex: 1 }} />
                <button className="btn ghost sm" onClick={() => cancelScheduled(s.id)}>취소</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
