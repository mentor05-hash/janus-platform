import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, EmptyState, SelectField } from '../components/ui';

// 강좌 v1 — 카탈로그(과목 필터) + 수강신청 + 내 수강. 데모 강좌(합성).
type Lecture = { id: string; subject: string; unit: string | null; title: string; summary: string | null; level: string | null; minutes: number | null; enrolled?: boolean };
const SUBJECTS = ['', '국어', '수학', '영어'];

export function LecturePage() {
  const [params] = useSearchParams();
  const [subject, setSubject] = useState(() => {
    const s = params.get('subject');
    return s && ['국어', '수학', '영어'].includes(s) ? s : '';
  });
  const [tab, setTab] = useState<'catalog' | 'mine'>('catalog');
  const [list, setList] = useState<Lecture[] | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    setList(null); setError('');
    const url = tab === 'mine' ? '/lectures/me' : `/lectures${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
    api.get<Lecture[]>(url).then(setList).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, [tab, subject]);
  useEffect(() => { load(); }, [load]);

  async function enroll(id: string) {
    setMsg(''); setError('');
    try { await api.post(`/lectures/${id}/enroll`, {}); setMsg('수강신청 완료!'); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '신청 실패'); }
  }

  return (
    <div>
      <PageHeader title="강좌" sub="약점 유형을 겨냥한 강좌를 골라 들어보세요. (현재 데모 강좌)" />
      <ErrorText>{error}</ErrorText>
      {msg && <div style={{ fontSize: 13, color: 'var(--brand)', marginBottom: 8 }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', padding: 3, gap: 3, borderRadius: 10, background: 'var(--j-ghost-bg)', border: '1px solid var(--j-ghost-border)' }}>
          {(['catalog', 'mine'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '7px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: tab === t ? 'var(--j-blue)' : 'transparent', color: tab === t ? '#fff' : 'var(--muted)',
            }}>{t === 'catalog' ? '전체 강좌' : '내 수강'}</button>
          ))}
        </div>
        {tab === 'catalog' && (
          <div style={{ minWidth: 140, marginLeft: 'auto' }}>
            <SelectField label="과목" value={subject} onChange={(e) => setSubject(e.target.value)}
              options={SUBJECTS.map((s) => ({ value: s, label: s || '전체' }))} />
          </div>
        )}
      </div>

      {list === null ? <Spinner /> : list.length === 0 ? (
        <EmptyState>{tab === 'mine' ? '수강 중인 강좌가 없어요.' : '해당 과목 강좌가 없어요.'}</EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {list.map((l) => (
            <Card key={l.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                <Badge kind="new">{l.subject}</Badge>
                {l.unit && <Badge kind="soft">{l.unit}</Badge>}
                {l.level && <Badge kind="soft">{l.level}</Badge>}
                {l.minutes != null && <span style={{ fontSize: 12, color: 'var(--caption)' }}>{l.minutes}분</span>}
                {(l.enrolled || tab === 'mine') && <Badge kind="done">수강중</Badge>}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{l.title}</div>
              {l.summary && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>{l.summary}</div>}
              {tab === 'catalog' && (
                <div style={{ marginTop: 10 }}>
                  {l.enrolled
                    ? <span style={{ fontSize: 13, color: 'var(--brand)' }}>✓ 수강 중</span>
                    : <Button onClick={() => enroll(l.id)}>수강신청</Button>}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
