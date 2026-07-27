import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { track } from '../utils/track';

/* 학원찾기 — 검색/필터/카드 리스트(스펙 §7-1). 통학·verified 배지, §5 스코어 정렬. */
type Card = {
  id: string; name: string; addr: string | null; dongCode: string | null;
  sourceLabel: string; nearestStation: { name?: string; line?: string; walk_min?: number } | null;
  verified: boolean; busPass: boolean; score: number;
  repClass: { subject: string; level: string; tuitionKrw: number | null; tuitionLabel: string } | null;
};
type Meta = { page: number; totalPages: number; total: number; sort?: string; capped?: boolean };

const SUBJECTS = ['', '국어', '수학', '영어', '과학', '사회', '입시'];
const LEVELS = [['', '전체'], ['basic', '기초'], ['regular', '일반'], ['advanced', '심화'], ['prep', '실전']];
const SORTS = [['score', '추천순'], ['tuition', '수강료순'], ['fresh', '최신순']];
const LEVEL_KO: Record<string, string> = { basic: '기초', regular: '일반', advanced: '심화', prep: '실전' };
const won = (n: number | null) => (n == null ? '-' : `${n.toLocaleString()}원`);

export function AcademyFinderPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  // 딥링크 프리셋(격차 리포트·학습 플랜 접합, 세션6) — URL 파라미터로 필터 선지정.
  const [f, setF] = useState({
    q: sp.get('q') ?? '', subject: sp.get('subject') ?? '', level: sp.get('level') ?? '', grade: sp.get('grade') ?? '',
    dong: sp.get('dong') ?? '', busOnly: sp.get('busOnly') === 'true', tuitionMax: sp.get('tuitionMax') ?? '', sort: sp.get('sort') ?? 'score',
  });
  const from = sp.get('from'); // gap | curriculum
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const [rows, setRows] = useState<Card[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async (p = 1) => {
    setErr('');
    const qs = new URLSearchParams({ page: String(p), size: '20', sort: f.sort });
    if (f.q) qs.set('q', f.q);
    if (f.subject) qs.set('subject', f.subject);
    if (f.level) qs.set('level', f.level);
    if (f.grade) qs.set('grade', f.grade);
    if (f.dong) qs.set('dong', f.dong);
    if (f.busOnly && f.dong) qs.set('busOnly', 'true');
    if (f.tuitionMax) qs.set('tuitionMax', f.tuitionMax);
    try {
      const r = await api.getPage<Card>(`/academies?${qs.toString()}`);
      setRows(r.data); setMeta(r.meta as Meta); setPage((r.meta as Meta).page ?? p);
    } catch (e) { setErr(e instanceof ApiError ? e.message : '검색 실패'); setRows([]); }
  }, [f]);
  useEffect(() => { track('academy', 'view', undefined, from ? { from } : undefined); void load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: 999, fontSize: 13, cursor: 'pointer', border: '1px solid var(--line)',
    background: active ? 'var(--teal-50,#E8F0F9)' : 'var(--surface)', color: active ? 'var(--teal,#1f6feb)' : 'var(--ink)', fontWeight: active ? 700 : 400,
  });

  return (
    <div>
      <h1 className="page-title">학원찾기</h1>
      <p className="page-sub">통학(버스 경유)·성적대까지 확인하고 상담을 신청하세요. 정보 출처는 카드마다 표시됩니다.</p>
      {from === 'gap' && <div className="card" style={{ padding: '10px 14px', marginBottom: 12, background: 'var(--teal-50,#E8F0F9)', fontSize: 13 }}>📊 격차 리포트에서 넘어왔어요 — 격차를 채울 주변 반을 프리셋으로 골라뒀습니다.</div>}
      {from === 'curriculum' && <div className="card" style={{ padding: '10px 14px', marginBottom: 12, background: 'var(--teal-50,#E8F0F9)', fontSize: 13 }}>🗂 학습 플랜의 약점 과목으로 오프라인 반(실수강료)을 찾았어요.</div>}

      {/* 필터 바 */}
      <div className="card" style={{ padding: 14, marginBottom: 14, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="input" placeholder="학원명 검색" value={f.q} onChange={(e) => set('q', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1)} style={{ flex: '1 1 180px' }} />
          <input className="input" placeholder="행정동 코드(통학)" value={f.dong} onChange={(e) => set('dong', e.target.value)} style={{ width: 150 }} />
          <input className="input" placeholder="수강료 상한(원)" value={f.tuitionMax} onChange={(e) => set('tuitionMax', e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 130 }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>과목</span>
          {SUBJECTS.map((s) => <span key={s || 'all'} style={chip(f.subject === s)} onClick={() => set('subject', s)}>{s || '전체'}</span>)}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>레벨</span>
          {LEVELS.map(([v, ko]) => <span key={v || 'all'} style={chip(f.level === v)} onClick={() => set('level', v)}>{ko}</span>)}
          {f.dong && <label style={{ marginLeft: 8, fontSize: 13, display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={f.busOnly} onChange={(e) => set('busOnly', e.target.checked)} />우리 동네 버스만</label>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>정렬</span>
          {SORTS.map(([v, ko]) => <span key={v} style={chip(f.sort === v)} onClick={() => { set('sort', v); }}>{ko}</span>)}
          <button className="btn" onClick={() => load(1)} style={{ marginLeft: 'auto' }}>검색</button>
        </div>
      </div>

      {err && <p style={{ color: 'var(--danger,#c0392b)', fontSize: 13 }}>{err}</p>}
      {meta?.capped && <p style={{ fontSize: 12, color: 'var(--muted)' }}>※ 결과가 많아 상위 일부만 채점되었습니다. 필터를 좁혀 주세요.</p>}

      {/* 카드 리스트 */}
      {rows === null ? <p style={{ color: 'var(--muted)' }}>불러오는 중…</p>
        : rows.length === 0 ? <div className="card" style={{ padding: 20 }}><p style={{ color: 'var(--muted)' }}>조건에 맞는 학원이 없어요.</p></div>
        : (
          <div style={{ display: 'grid', gap: 10 }}>
            {rows.map((a) => (
              <button key={a.id} onClick={() => nav(`/student/academies/${a.id}`)} className="card"
                style={{ padding: 16, textAlign: 'left', cursor: 'pointer', border: '1px solid var(--line)', display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 16 }}>{a.name}</b>
                  {a.verified && <span style={{ fontSize: 11, fontWeight: 700, color: '#1f7a52', background: '#e3f3ea', borderRadius: 6, padding: '2px 7px' }}>야누스 검증 ✓</span>}
                  {a.busPass && <span style={{ fontSize: 11, fontWeight: 700, color: '#1f6feb', background: 'var(--teal-50,#E8F0F9)', borderRadius: 6, padding: '2px 7px' }}>🚌 우리 동네 경유</span>}
                </div>
                {a.repClass && <div style={{ fontSize: 13, color: 'var(--ink)' }}>{a.repClass.subject} · {LEVEL_KO[a.repClass.level] ?? a.repClass.level} · {won(a.repClass.tuitionKrw)} <span style={{ color: 'var(--muted)', fontSize: 12 }}>({a.repClass.tuitionLabel})</span></div>}
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {a.addr ?? '주소 미상'}{a.nearestStation?.name ? ` · ${a.nearestStation.name}역 도보 ${a.nearestStation.walk_min ?? '?'}분` : ''} · 출처 {a.sourceLabel}
                </div>
              </button>
            ))}
          </div>
        )}

      {meta && meta.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 14, alignItems: 'center' }}>
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => load(page - 1)}>이전</button>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{page} / {meta.totalPages}</span>
          <button className="btn btn-ghost" disabled={page >= meta.totalPages} onClick={() => load(page + 1)}>다음</button>
        </div>
      )}
    </div>
  );
}
