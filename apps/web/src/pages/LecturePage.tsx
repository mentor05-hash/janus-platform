import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, ErrorText, Spinner, EmptyState, SelectField } from '../components/ui';

// 강좌 v1 — 카탈로그(과목 필터) + 수강신청 + 내 수강. 데모 강좌(합성).
type Lecture = { id: string; subject: string; unit: string | null; title: string; summary: string | null; level: string | null; minutes: number | null; enrolled?: boolean };
const SUBJECTS = ['', '국어', '수학', '영어'];

export function LecturePage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [params] = useSearchParams();
  const [subject, setSubject] = useState(() => {
    const s = params.get('subject');
    return s && ['국어', '수학', '영어'].includes(s) ? s : '';
  });
  const [tab, setTab] = useState<'catalog' | 'mine'>('catalog');
  const [searchQ, setSearchQ] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [list, setList] = useState<Lecture[] | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    setList(null); setError('');
    let url = '/lectures/me';
    if (tab === 'catalog') {
      const qs = new URLSearchParams();
      if (subject) qs.set('subject', subject);
      if (searchApplied.trim()) qs.set('q', searchApplied.trim());
      url = `/lectures${qs.toString() ? `?${qs.toString()}` : ''}`;
    }
    api.get<Lecture[]>(url).then(setList).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, [tab, subject, searchApplied]);
  useEffect(() => { load(); }, [load]);

  async function enroll(id: string) {
    setMsg(''); setError('');
    try { await api.post(`/lectures/${id}/enroll`, {}); setMsg('수강신청 완료!'); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '신청 실패'); }
  }

  if (openId) return <LectureDetail id={openId} onBack={() => { setOpenId(null); load(); }} />;

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
          <div style={{ minWidth: 130, marginLeft: 'auto' }}>
            <SelectField label="과목" value={subject} onChange={(e) => setSubject(e.target.value)}
              options={SUBJECTS.map((s) => ({ value: s, label: s || '전체' }))} />
          </div>
        )}
      </div>
      {tab === 'catalog' && (
        <form onSubmit={(e) => { e.preventDefault(); setSearchApplied(searchQ); }} style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="강좌 검색 (제목·유형)" className="input" style={{ flex: 1 }} />
          <Button onClick={() => setSearchApplied(searchQ)}>검색</Button>
          {searchApplied && <button type="button" onClick={() => { setSearchQ(''); setSearchApplied(''); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>✕</button>}
        </form>
      )}

      {list === null ? <Spinner /> : list.length === 0 ? (
        <EmptyState>{tab === 'mine' ? '수강 중인 강좌가 없어요.' : '해당 과목 강좌가 없어요.'}</EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {list.map((l) => (
            <div key={l.id} role="button" tabIndex={0} onClick={() => setOpenId(l.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(l.id); } }} style={{ cursor: 'pointer' }}>
              <Card>
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
                      ? <span style={{ fontSize: 13, color: 'var(--brand)' }}>✓ 수강 중 · 눌러서 보기</span>
                      : <Button onClick={(e) => { e.stopPropagation(); enroll(l.id); }}>수강신청</Button>}
                  </div>
                )}
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 강좌 상세 — 영상 슬롯 + 진도(수강 시). 영상 URL 없으면 준비중 플레이스홀더.
type Detail = { id: string; subject: string; unit: string | null; title: string; summary: string | null; level: string | null; minutes: number | null; videoUrl: string | null; enrolled: boolean; progress: number };

function LectureDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    setD(null);
    api.get<Detail>(`/lectures/${id}`).then(setD).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function enroll() {
    try { await api.post(`/lectures/${id}/enroll`, {}); setMsg('수강신청 완료!'); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '신청 실패'); }
  }
  async function setProgress(p: number) {
    setError('');
    try { await api.patch(`/lectures/${id}/progress`, { progress: p }); setMsg(p >= 100 ? '수강 완료!' : '진도 저장됨'); load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '진도 저장 실패'); }
  }

  if (d === null) return <Spinner />;

  return (
    <div>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0, marginBottom: 12, fontSize: 13 }}>← 강좌 목록</button>
      <ErrorText>{error}</ErrorText>
      {msg && <div style={{ fontSize: 13, color: 'var(--brand)', marginBottom: 8 }}>{msg}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        <Badge kind="new">{d.subject}</Badge>
        {d.unit && <Badge kind="soft">{d.unit}</Badge>}
        {d.level && <Badge kind="soft">{d.level}</Badge>}
        {d.minutes != null && <span style={{ fontSize: 12, color: 'var(--caption)' }}>{d.minutes}분</span>}
      </div>
      <h2 style={{ fontSize: 20, margin: '0 0 6px', color: 'var(--ink)' }}>{d.title}</h2>
      {d.summary && <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.6, marginTop: 0 }}>{d.summary}</p>}

      {/* 영상 슬롯 */}
      <div style={{ aspectRatio: '16 / 9', width: '100%', borderRadius: 12, background: '#0d1626', display: 'grid', placeItems: 'center', color: '#8fb8de', margin: '10px 0 14px' }}>
        {d.videoUrl
          ? <video src={d.videoUrl} controls style={{ width: '100%', height: '100%', borderRadius: 12, background: '#000' }} />
          : <div style={{ textAlign: 'center' }}><div style={{ fontSize: 34 }}>▶</div><div style={{ fontSize: 13, marginTop: 6 }}>영상 준비 중 (데모 강좌)</div></div>}
      </div>

      {!d.enrolled ? (
        <Card><div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><span style={{ fontSize: 14, color: 'var(--ink)' }}>수강신청하면 진도가 저장돼요.</span><Button onClick={enroll}>수강신청</Button></div></Card>
      ) : (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>내 진도</span>
            <span style={{ fontSize: 13, color: d.progress >= 100 ? 'var(--brand)' : 'var(--muted)', marginLeft: 'auto' }}>{d.progress}%{d.progress >= 100 ? ' · 완료' : ''}</span>
          </div>
          <div style={{ height: 8, borderRadius: 5, background: 'var(--line-soft)', overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ width: `${d.progress}%`, height: '100%', background: d.progress >= 100 ? 'var(--brand, #16a34a)' : 'var(--j-blue)' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[25, 50, 75, 100].map((p) => (
              <button key={p} onClick={() => setProgress(p)} style={{
                fontSize: 12.5, fontWeight: 700, padding: '7px 13px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${d.progress >= p ? 'var(--j-blue)' : 'var(--line-soft)'}`,
                background: d.progress >= p ? 'var(--j-blue-soft)' : 'transparent', color: d.progress >= p ? 'var(--j-blue)' : 'var(--muted)',
              }}>{p === 100 ? '완료 표시' : `${p}%`}</button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
