import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { track } from '../utils/track';

/** 격차 리포트 v1 (janus_report·C5). 내 성적(전국누백)과 목표 컷의 격차를 근거·처방과 함께. */
type RelTier = 'measured' | 'multiyear' | 'estimated';
type GapReport = {
  kind: 'gap'; version: string;
  generatedFor: { gye: string | null; nb: number };
  target: { univ: string; dept: string; cutNb: number; track?: string };
  gap: { deltaNb: number; shortfall: number; band: '안정' | '적정' | '소신' | '상향'; admitProbHint: number | null; message: string };
  evidence: Array<{ claim: string; source: string; relTier: RelTier }>;
  prescription: { headline: string; actions: Array<{ label: string; to: string; ctaId?: string; free?: boolean }> };
  disclaimer: string;
};
type JScore = { gye: string | null; mode: string; nb?: number };

const BAND_COLOR: Record<string, string> = { 안정: '#2A8A5F', 적정: '#2F6FB3', 소신: '#CF9A3A', 상향: '#E5484D' };
const REL_LABEL: Record<RelTier, string> = { measured: '어디가 실측', multiyear: '다년 앵커', estimated: '추정' };
const REL_COLOR: Record<RelTier, string> = { measured: '#2A8A5F', multiyear: '#2F6FB3', estimated: '#8695a8' };

export function GapReportPage() {
  const { user } = useAuth();
  const [scoreState, setScoreState] = useState<'loading' | 'ready' | 'noscore' | 'nonb'>('loading');
  const [score, setScore] = useState<JScore | null>(null);
  const [univ, setUniv] = useState('');
  const [dept, setDept] = useState('');
  const [cutNb, setCutNb] = useState('');
  const [report, setReport] = useState<GapReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 목표컷 실연동(N29) — 배치표 targets.json 서빙 가능하면 검색, 아니면 수동 입력 폴백.
  const [tMode, setTMode] = useState<'unknown' | 'search' | 'manual'>('unknown');
  const [tq, setTq] = useState('');
  const [tResults, setTResults] = useState<Array<{ univ: string; dept: string; track?: string; cutNb: number }>>([]);
  const [picked, setPicked] = useState(false);

  useEffect(() => { track('baechi', 'view', undefined, { view: 'gap' }); }, []);

  // 목표컷 데이터 배치 여부 프로브
  useEffect(() => {
    if (!user) return;
    api.get<{ available: boolean }>('/placement-hub/targets?q=')
      .then((r) => setTMode(r.available ? 'search' : 'manual'))
      .catch(() => setTMode('manual'));
  }, [user]);

  // 목표 검색(디바운스)
  useEffect(() => {
    if (tMode !== 'search') return;
    const term = tq.trim();
    if (!term || picked) { setTResults([]); return; }
    const id = setTimeout(() => {
      api.get<{ targets: typeof tResults }>(`/placement-hub/targets?q=${encodeURIComponent(term)}`)
        .then((r) => setTResults(r.targets)).catch(() => setTResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [tq, tMode, picked]);

  function pickTarget(t: { univ: string; dept: string; cutNb: number }) {
    setUniv(t.univ); setDept(t.dept); setCutNb(String(t.cutNb));
    setPicked(true); setTResults([]); setTq(`${t.univ} ${t.dept}`);
  }

  useEffect(() => {
    if (!user) return;
    api.get<JScore>('/scores/janus-score')
      .then((s) => { setScore(s); setScoreState(s.nb == null ? 'nonb' : 'ready'); })
      .catch((e) => { setScoreState(e instanceof ApiError && e.code === 'NO_SCORE' ? 'noscore' : 'nonb'); });
  }, [user]);

  async function submit() {
    setErr(null);
    const cut = Number(cutNb);
    if (!univ.trim() || !dept.trim() || !Number.isFinite(cut) || cut <= 0 || cut >= 100) {
      setErr('대학·학과·목표 전국누백(0.01~99.99)을 입력하세요.'); return;
    }
    setBusy(true);
    try {
      const r = await api.post<GapReport>('/scores/gap-report', { univ: univ.trim(), dept: dept.trim(), cutNb: cut });
      setReport(r);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '격차 리포트 생성 실패');
    } finally { setBusy(false); }
  }

  const card: React.CSSProperties = { background: 'var(--surface,#fff)', border: '1px solid var(--line,#e4eaf1)', borderRadius: 14, padding: 20, marginBottom: 16 };
  const wrap: React.CSSProperties = { maxWidth: 720, margin: '0 auto', padding: '28px 18px 60px', fontFamily: 'system-ui, sans-serif', color: 'var(--ink,#16233a)' };

  if (!user) {
    return (
      <div style={wrap}>
        <h1 style={{ fontSize: 22 }}>야누스 격차 리포트</h1>
        <p style={{ color: 'var(--muted,#5a6b83)', lineHeight: 1.7 }}>내 성적과 목표의 격차를 근거와 함께 확인하려면 로그인이 필요합니다.</p>
        <Link to="/login" className="btn gold">로그인하고 시작하기 →</Link>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>야누스 격차 리포트</h1>
      <p style={{ color: 'var(--muted,#5a6b83)', fontSize: 13.5, margin: '0 0 20px', lineHeight: 1.6 }}>
        목표까지 얼마나 부족한지, <b>근거와 함께</b> 확인하고 무엇부터 하면 되는지 처방을 받습니다.
      </p>

      {/* 내 성적 */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>내 위치</div>
        {scoreState === 'loading' && <p style={{ color: 'var(--muted)', fontSize: 13 }}>불러오는 중…</p>}
        {scoreState === 'ready' && score && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontSize: 30, fontWeight: 800, fontFamily: 'ui-monospace, monospace', color: 'var(--teal,#2f6fb3)' }}>{score.nb}%</span>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>전국누백 · {score.gye ?? '계열 미상'}</span>
          </div>
        )}
        {(scoreState === 'noscore' || scoreState === 'nonb') && (
          <div style={{ background: '#fbeae7', border: '1px solid #f0cfc9', color: '#a64b37', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
            {scoreState === 'noscore' ? '연동할 성적이 없습니다.' : '전국누백이 아직 없습니다.'} <Link to="/placement" style={{ color: 'inherit', textDecoration: 'underline' }}>배치표에서 점수를 적용</Link>하면 자동으로 계산됩니다.
          </div>
        )}
      </div>

      {/* 목표 설정 — 데이터 있으면 배치표 목표컷 검색(N29), 없으면 수동 입력 */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>목표 설정</div>
        {tMode === 'search' ? (
          <div style={{ position: 'relative' }}>
            <input className="input" placeholder="목표 대학·학과 검색 (예: 서울대 컴퓨터)" value={tq}
              onChange={(e) => { setTq(e.target.value); setPicked(false); }} />
            {picked && cutNb && (
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 6 }}>
                선택: <b style={{ color: 'var(--ink)' }}>{univ} {dept}</b> · 지원가능선 전국누백 <b>{cutNb}%</b>
              </div>
            )}
            {tResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, marginTop: 4, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: '0 6px 20px rgba(0,0,0,.1)', maxHeight: 260, overflowY: 'auto' }}>
                {tResults.map((t, i) => (
                  <button key={i} onClick={() => pickTarget(t)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderTop: i ? '1px solid var(--line)' : 'none', background: 'none', cursor: 'pointer', fontSize: 13.5 }}>
                    <b>{t.univ} {t.dept}</b>{t.track ? <span style={{ color: 'var(--muted)' }}> · {t.track}</span> : null}
                    <span style={{ float: 'right', fontFamily: 'ui-monospace,monospace', color: 'var(--teal)' }}>{t.cutNb}%</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input className="input" placeholder="대학 (예: 서울대)" value={univ} onChange={(e) => setUniv(e.target.value)} />
              <input className="input" placeholder="학과 (예: 컴퓨터공학)" value={dept} onChange={(e) => setDept(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input className="input" type="number" step="0.01" placeholder="목표 전국누백 (예: 1.5)" value={cutNb} onChange={(e) => setCutNb(e.target.value)} style={{ maxWidth: 220 }} />
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>배치표의 목표 학과 지원가능선(70%컷)을 넣으세요</span>
            </div>
          </>
        )}
        {err && <p style={{ color: '#a64b37', fontSize: 12.5, marginTop: 10 }}>{err}</p>}
        <button className="btn gold" onClick={submit} disabled={busy || scoreState !== 'ready'} style={{ marginTop: 14 }}>
          {busy ? '분석 중…' : '격차 리포트 생성 →'}
        </button>
      </div>

      {/* 리포트 */}
      {report && (
        <>
          <div style={{ ...card, borderLeft: `4px solid ${BAND_COLOR[report.gap.band]}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: BAND_COLOR[report.gap.band], borderRadius: 999, padding: '3px 12px' }}>{report.gap.band}</span>
              {report.gap.admitProbHint != null && (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>참고 합격률 힌트 ≈ <b>{report.gap.admitProbHint}%</b></span>
              )}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.5, marginBottom: 8 }}>{report.prescription.headline}</div>
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>{report.gap.message}</div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>근거 <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)' }}>· 신뢰도 표기(C5)</span></div>
            {report.evidence.map((e, i) => (
              <div key={i} style={{ padding: '10px 0', borderTop: i ? '1px solid var(--line)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', background: REL_COLOR[e.relTier], borderRadius: 5, padding: '2px 7px' }}>{REL_LABEL[e.relTier]}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{e.source}</span>
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{e.claim}</div>
              </div>
            ))}
          </div>

          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>처방 <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)' }}>· 무료부터 시작</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {report.prescription.actions.map((a, i) => {
                const gold = a.ctaId === 'consult-reserve';
                return (
                  <Link key={i} id={a.ctaId} to={a.to}
                    onClick={() => { if (a.ctaId) track('baechi', 'cta', a.ctaId, { view: 'gap' }); }}
                    className={gold ? 'btn gold' : 'btn ghost'}
                    style={{ textDecoration: 'none', justifyContent: 'space-between', display: 'flex', alignItems: 'center' }}>
                    <span>{a.label}</span>
                    {a.free && <span style={{ fontSize: 11, fontWeight: 800, color: '#2A8A5F', background: '#e9f5ee', borderRadius: 6, padding: '2px 8px' }}>무료</span>}
                  </Link>
                );
              })}
            </div>
          </div>

          <p style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.6, textAlign: 'center' }}>{report.disclaimer}</p>
        </>
      )}
    </div>
  );
}
