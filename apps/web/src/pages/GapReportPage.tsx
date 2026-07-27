import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { track } from '../utils/track';
import { MatchRecommendCards } from '../components/MatchRecommendCards';
import { Card } from '../components/ui';

/** 격차 리포트 v1 (janus_report·C5). 정시(전국누백)/수시(내신등급) 격차를 근거·처방과 함께. */
type RelTier = 'measured' | 'multiyear' | 'estimated';
type Mode = 'jeongsi' | 'susi';
type GapReport = {
  kind: 'gap'; version: string; mode: Mode;
  unit: { label: string; suffix: string };
  gap: { delta: number; shortfall: number; band: '안정' | '적정' | '소신' | '상향'; admitProbHint: number | null; message: string };
  /** 회차 변동성(O108) — 최고·최저 회차로 각각 판정해 '밴드가 뒤집히는지'만 알려준다. 구 페이로드는 null/미존재. */
  volatility?: {
    count: number; best: number; worst: number; spread: number;
    bestBand: string; worstBand: string; consistent: boolean; smallSample: boolean; message: string;
  } | null;
  evidence: Array<{ claim: string; source: string; relTier: RelTier }>;
  prescription: { headline: string; actions: Array<{ label: string; to: string; ctaId?: string; free?: boolean }> };
  disclaimer: string;
};
type GapPayloadFull = GapReport & {
  target: { univ: string; dept: string; cut: number; track?: string };
  generatedFor: { gye: string | null; value: number };
};
/** GET /me/reports — janus_report 이력 행(payload = 트렁크 JanusReport 봉투). */
type GapHistory = { id: string; kind: string; status: string; created_at: string; payload: GapPayloadFull };
type JScore = { gye: string | null; mode: string; nb?: number };

const BAND_COLOR: Record<string, string> = { 안정: '#2A8A5F', 적정: '#2F6FB3', 소신: '#CF9A3A', 상향: '#E5484D' };
const REL_LABEL: Record<RelTier, string> = { measured: '어디가 실측', multiyear: '다년 앵커', estimated: '추정' };
const REL_COLOR: Record<RelTier, string> = { measured: '#2A8A5F', multiyear: '#2F6FB3', estimated: '#8695a8' };

export function GapReportPage() {
  const { user } = useAuth();
  const [scoreState, setScoreState] = useState<'loading' | 'ready' | 'noscore' | 'nonb'>('loading');
  const [score, setScore] = useState<JScore | null>(null);
  const [mode, setMode] = useState<Mode>('jeongsi');
  const [myGrade, setMyGrade] = useState(''); // 수시: 내신 평균등급
  const [univ, setUniv] = useState('');
  const [dept, setDept] = useState('');
  const [cutNb, setCutNb] = useState('');
  const [report, setReport] = useState<GapReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 목표컷 실연동(N29) — 배치표 targets.json 서빙 가능하면 검색, 아니면 수동 입력 폴백.
  const [tMode, setTMode] = useState<'unknown' | 'search' | 'manual'>('unknown');
  const [tq, setTq] = useState('');
  const [tResults, setTResults] = useState<Array<{ univ: string; dept: string; track?: string; cut: number }>>([]);
  const [picked, setPicked] = useState(false);
  const [goalTarget, setGoalTarget] = useState<{ university: string | null; department: string | null } | null>(null);
  const [history, setHistory] = useState<GapHistory[]>([]);
  // 산출물 이력(janus_report) — 학생 본인 것만. 실패는 무해(이력은 부가 정보).
  const loadHistory = () => {
    if (user?.role !== 'student') return;
    api.get<GapHistory[]>('/me/reports?kind=gap&limit=5').then((r) => setHistory(Array.isArray(r) ? r : [])).catch(() => {});
  };
  useEffect(loadHistory, [user]);
  const cutSuffix = mode === 'susi' ? '등급' : '%';

  useEffect(() => { track('baechi', 'view', undefined, { view: 'gap' }); }, []);

  // 자가목표(janus_goal) 조회 — 목표 설정(/student/goal)에서 정한 목표 대학·학과. 학생 전용 엔드포인트라 role 가드.
  useEffect(() => {
    if (user?.role !== 'student') return;
    api.get<{ university: string | null; department: string | null }>('/me/goal')
      .then((g) => { if (g.university || g.department) setGoalTarget({ university: g.university, department: g.department }); })
      .catch(() => {}); // 목표 미설정·프로필 없음 → 프리필 없이 수동 입력
  }, [user]);

  // 목표 대학·학과 프리필 — 입력란이 빈 경우에만 채운다(사용자 입력 보존).
  // 모드 전환이 입력을 초기화하므로(아래 토글) mode 도 의존해 재적용한다.
  // 검색어(tq)는 건드리지 않는다 — 타이핑하지 않았는데 목표컷 드롭다운이 열리는 것을 막기 위해.
  useEffect(() => {
    if (!goalTarget) return;
    setUniv((v) => v || goalTarget.university || '');
    setDept((v) => v || goalTarget.department || '');
  }, [goalTarget, mode]);

  // 목표컷 데이터 배치 여부 프로브(모드별 — 정시/수시 각각 targets 유무 다름)
  useEffect(() => {
    if (!user) return;
    api.get<{ available: boolean }>(`/placement-hub/targets?q=&mode=${mode}`)
      .then((r) => setTMode(r.available ? 'search' : 'manual'))
      .catch(() => setTMode('manual'));
  }, [user, mode]);

  // 목표 검색(디바운스, 모드별)
  useEffect(() => {
    if (tMode !== 'search') return;
    const term = tq.trim();
    if (!term || picked) { setTResults([]); return; }
    const id = setTimeout(() => {
      api.get<{ targets: typeof tResults }>(`/placement-hub/targets?q=${encodeURIComponent(term)}&mode=${mode}`)
        .then((r) => setTResults(r.targets)).catch(() => setTResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [tq, tMode, picked, mode]);

  function pickTarget(t: { univ: string; dept: string; cut: number }) {
    setUniv(t.univ); setDept(t.dept); setCutNb(String(t.cut));
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
    const cutMax = mode === 'susi' ? 9.01 : 100;
    if (!univ.trim() || !dept.trim() || !Number.isFinite(cut) || cut <= 0 || cut >= cutMax) {
      setErr(mode === 'susi' ? '대학·학과·목표 내신 등급(1~9)을 입력하세요.' : '대학·학과·목표 전국누백(0.01~99.99)을 입력하세요.'); return;
    }
    const grade = Number(myGrade);
    if (mode === 'susi' && (!Number.isFinite(grade) || grade < 1 || grade > 9)) { setErr('내 내신 평균등급(1~9)을 입력하세요.'); return; }
    setBusy(true);
    try {
      const body: { mode: Mode; univ: string; dept: string; cutNb: number; myGrade?: number } =
        { mode, univ: univ.trim(), dept: dept.trim(), cutNb: cut, ...(mode === 'susi' ? { myGrade: grade } : {}) };
      const r = await api.post<GapReport>('/scores/gap-report', body);
      setReport(r);
      loadHistory(); // 새 산출이 적재됐으면 이력에 반영(동일 산출이면 서버가 skip)
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

      {/* 모드 토글 — 정시(수능 누백) / 수시(내신 등급) */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['jeongsi', 'susi'] as Mode[]).map((m) => (
          <button key={m} onClick={() => { setMode(m); setReport(null); setTq(''); setPicked(false); setTResults([]); setUniv(''); setDept(''); setCutNb(''); }}
            className={mode === m ? 'btn sm' : 'btn ghost sm'} style={{ minWidth: 96 }}>
            {m === 'jeongsi' ? '정시 (수능)' : '수시 (내신)'}
          </button>
        ))}
      </div>

      {/* 내 위치 */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>내 위치</div>
        {mode === 'jeongsi' ? (
          <>
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
          </>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="input" type="number" step="0.01" min={1} max={9} placeholder="내신 평균등급 (예: 2.3)" value={myGrade} onChange={(e) => setMyGrade(e.target.value)} style={{ maxWidth: 200 }} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>전 과목 평균 등급(1~9)을 입력하세요</span>
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
                선택: <b style={{ color: 'var(--ink)' }}>{univ} {dept}</b> · 지원가능선 <b>{cutNb}{cutSuffix}</b>
              </div>
            )}
            {tResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, marginTop: 4, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: '0 6px 20px rgba(0,0,0,.1)', maxHeight: 260, overflowY: 'auto' }}>
                {tResults.map((t, i) => (
                  <button key={i} onClick={() => pickTarget(t)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderTop: i ? '1px solid var(--line)' : 'none', background: 'none', cursor: 'pointer', fontSize: 13.5 }}>
                    <b>{t.univ} {t.dept}</b>{t.track ? <span style={{ color: 'var(--muted)' }}> · {t.track}</span> : null}
                    <span style={{ float: 'right', fontFamily: 'ui-monospace,monospace', color: 'var(--teal)' }}>{t.cut}{cutSuffix}</span>
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
              <input className="input" type="number" step="0.01" placeholder={mode === 'susi' ? '목표 내신 등급 (예: 1.8)' : '목표 전국누백 (예: 1.5)'} value={cutNb} onChange={(e) => setCutNb(e.target.value)} style={{ maxWidth: 220 }} />
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{mode === 'susi' ? '목표 학과의 수시 지원가능선(내신 등급)' : '배치표의 목표 학과 지원가능선(70%컷)'}을 넣으세요</span>
            </div>
          </>
        )}
        {err && <p style={{ color: '#a64b37', fontSize: 12.5, marginTop: 10 }}>{err}</p>}
        <button className="btn gold" onClick={submit} disabled={busy || (mode === 'jeongsi' && scoreState !== 'ready')} style={{ marginTop: 14 }}>
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
            {/* 회차 변동성(O108) — 시험 1회성 편차. 밴드가 뒤집히면 구간으로 알려준다. */}
            {report.volatility && (
              <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2, #f0f3f7)', fontSize: 12.5, color: 'var(--ink-body)', lineHeight: 1.6 }}>
                {/* 뒤집히는 경우엔 두 밴드를 색으로 먼저 보여준다 — 문장이 이미 '회차에 따라 …갈립니다'를
                    설명하므로 여기서 같은 말을 반복하지 않고 시각적 대비만 담당한다. */}
                {!report.volatility.consistent && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    {[report.volatility.bestBand, report.volatility.worstBand].map((b, i) => (
                      <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {i ? <span style={{ color: 'var(--muted)', fontWeight: 700 }}>~</span> : null}
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: '#fff', background: BAND_COLOR[b] ?? 'var(--muted)', borderRadius: 999, padding: '2px 9px' }}>{b}</span>
                      </span>
                    ))}
                  </div>
                )}
                {report.volatility.message}
                {report.volatility.smallSample && (
                  <span style={{ color: 'var(--muted)' }}> (회차가 {report.volatility.count}회뿐이라 추세로 보기엔 이릅니다)</span>
                )}
              </div>
            )}
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
              {/* 세션6 접합: 격차를 채울 주변 학원 반 — 격차 band 로 레벨 프리셋 딥링크. */}
              <Link
                to={`/student/academies?from=gap&level=${report.gap.band === '상향' ? 'prep' : report.gap.band === '소신' ? 'advanced' : 'regular'}`}
                onClick={() => track('baechi', 'cta', 'academy-finder', { view: 'gap', band: report.gap.band })}
                className="btn ghost" style={{ textDecoration: 'none', justifyContent: 'space-between', display: 'flex', alignItems: 'center' }}>
                <span>🏫 이 격차를 채울 주변 반 보기</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>학원찾기 →</span>
              </Link>
            </div>
          </div>

          {/* 진단→추천 매칭: 격차 진단 결과로 적합 상담사 카드 노출 → 예약 연결(거래 완결) */}
          <MatchRecommendCards />

          <p style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.6, textAlign: 'center' }}>{report.disclaimer}</p>
        </>
      )}

      {/* 산출물 이력(janus_report) — 이전에 무엇을 언제 봤는지 재현. 같은 산출은 적재되지 않아 변화만 쌓인다. */}
      {history.length > 0 && (
        <Card title="이전 리포트 이력" style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            {history.map((h) => {
              const p = h.payload;
              return (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8, borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 96 }}>{new Date(h.created_at).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' })}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: BAND_COLOR[p.gap.band] ?? 'var(--ink)' }}>{p.gap.band}</span>
                  <span style={{ fontSize: 13, color: 'var(--ink)', flex: 1, minWidth: 160 }}>
                    {p.target.univ} {p.target.dept} · 컷 {p.target.cut}{p.unit.suffix}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    내 {p.unit.label} {p.generatedFor.value}{p.unit.suffix}
                    {p.gap.shortfall > 0 ? ` · ${p.gap.shortfall} 부족` : ' · 도달'}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--muted)' }}>
            같은 목표·같은 내 위치로 다시 열면 새로 쌓이지 않아요(변화만 기록).
          </div>
        </Card>
      )}
    </div>
  );
}
