import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Spinner, ErrorText, Button, TextField, SelectField } from '../components/ui';

/**
 * 목표 설정 (WD-9) — 목표 대학·학과·라인·평균(janus_goal 규약).
 * 저장 시 격차 리포트·대시보드에 반영. 상담·컨설팅이 같은 목표 계약을 읽는다.
 */

type Goal = { tier: string | null; avg: number | null; university: string | null; department: string | null };

type Mode = 'jeongsi' | 'susi';
type Candidate = { id: string; mode: Mode; univ: string; dept: string; track: string | null; cut: number; note: string | null };
/**
 * 후보 행의 volatility 는 **컷에 종속된 3키만** 온다(O108) — 범위·표본 수는 후보 불변값이라 목록 헤더가 1회 담당한다.
 * 밴드 칩은 계속 **점 판정(band)** 이다. 뒤집힘은 보조 줄로 덧붙이고 칩을 대체하지 않는다.
 */
type CandVolatility = { bestBand: string; worstBand: string; consistent: boolean };
type CandRow = { id: string; univ: string; dept: string; track: string | null; cut: number; band: string; delta: number; shortfall: number; message: string; volatility: CandVolatility | null };
type CandReport = {
  mode: Mode; myValue: number; unit: { label: string; suffix: string };
  spread: { count: number; best: number; worst: number; spread: number } | null;
  smallSample: boolean | null;
  flipCount: number;
  volatilityNote: string | null;
  candidates: CandRow[];
  admitHintNote: string | null;
  evidence: { claim: string; source: string; relTier: string }[];
  disclaimer: string;
};

// 신호등 4구간 — 트렁크 gap-report 어휘(안정/적정/소신/상향) 그대로.
const BAND_COLOR: Record<string, string> = { 안정: '#2a8a5f', 적정: '#57a86a', 소신: '#cf9f2f', 상향: '#d06b52' };
const REL_LABEL: Record<string, string> = { measured: '실측', multiyear: '다년', estimated: '추정' };

const TIER_OPTIONS = [
  { value: '', label: '선택 안 함' },
  { value: '최상위', label: '최상위 (서울대·의약학 라인)' },
  { value: '상위', label: '상위 (서성한·중경외시 라인)' },
  { value: '중상위', label: '중상위 (건동홍·국숭세단 라인)' },
  { value: '중위', label: '중위 (인서울 하위·수도권 라인)' },
  { value: '중하위', label: '중하위 (수도권·지방 국립 라인)' },
  { value: '기초', label: '기초 (지방권·전문대 라인)' },
];

export function StudentGoalPage() {
  const nav = useNavigate();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<Goal>('/me/goal')
      .then((g) => setGoal({ tier: g.tier ?? null, avg: g.avg ?? null, university: g.university ?? null, department: g.department ?? null }))
      .catch((e) => { setGoal({ tier: null, avg: null, university: null, department: null }); if (!(e instanceof ApiError && e.status === 404)) setError(e instanceof ApiError ? e.message : '조회 실패'); });
  }, []);

  const set = (patch: Partial<Goal>) => { setGoal((g) => ({ ...(g as Goal), ...patch })); setSaved(false); };

  // ── 목표 후보 비교 ──
  const [mode, setMode] = useState<Mode>('jeongsi');
  const [myGrade, setMyGrade] = useState(''); // 수시: 내신 평균등급
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [report, setReport] = useState<CandReport | null>(null);
  const [candErr, setCandErr] = useState('');
  const [form, setForm] = useState({ univ: '', dept: '', cut: '', track: '' });
  const [busy, setBusy] = useState(false);

  const loadCands = () =>
    api.get<Candidate[]>(`/me/goal/candidates?mode=${mode}`)
      .then((r) => setCands(Array.isArray(r) ? r : []))
      .catch(() => setCands([]));

  // 후보 목록이 바뀌면 비교 리포트를 다시 계산(성적·목표컷은 서버가 판단).
  const loadReport = () => {
    const q = mode === 'susi' ? `?mode=susi&myGrade=${encodeURIComponent(myGrade)}` : '?mode=jeongsi';
    return api.get<CandReport>(`/me/goal/candidates/report${q}`)
      .then((r) => { setReport(r); setCandErr(''); })
      .catch((e) => { setReport(null); setCandErr(e instanceof ApiError ? e.message : '비교 실패'); });
  };

  useEffect(() => { loadCands(); }, [mode]);
  useEffect(() => {
    if (!cands?.length) { setReport(null); return; }
    if (mode === 'susi' && !myGrade.trim()) { setReport(null); return; } // 수시는 내신 등급 입력이 있어야 계산
    loadReport();
  }, [cands, mode, myGrade]);

  async function addCand() {
    const cut = Number(form.cut);
    if (!form.univ.trim() || !form.dept.trim() || !Number.isFinite(cut) || cut <= 0) {
      setCandErr('대학·학과·목표 컷을 입력하세요.');
      return;
    }
    setBusy(true); setCandErr('');
    try {
      // cutSource=manual — 배치표 조회값이 아니라 학생이 직접 넣은 컷임을 감사 기록(O65 경계).
      await api.post('/me/goal/candidates', { mode, univ: form.univ.trim(), dept: form.dept.trim(), cut, track: form.track.trim() || null, cutSource: 'manual' });
      setForm({ univ: '', dept: '', cut: '', track: '' });
      await loadCands();
    } catch (e) {
      setCandErr(e instanceof ApiError ? e.message : '후보 추가 실패');
    } finally { setBusy(false); }
  }

  async function delCand(id: string) {
    await api.del(`/me/goal/candidates/${id}`).catch(() => {});
    await loadCands();
  }

  /** 후보를 기준 목표로 승격 — 기존 PUT /me/goal 계약 재사용(대학·학과만 교체, 평균·라인은 유지). */
  async function promote(c: CandRow) {
    setBusy(true); setCandErr('');
    try {
      const g = await api.put<Goal>('/me/goal', { tier: goal?.tier ?? null, avg: goal?.avg ?? null, university: c.univ, department: c.dept });
      setGoal({ tier: g.tier ?? null, avg: g.avg ?? null, university: g.university ?? null, department: g.department ?? null });
      setSaved(true);
    } catch (e) {
      setCandErr(e instanceof ApiError ? e.message : '목표 설정 실패');
    } finally { setBusy(false); }
  }

  const save = async () => {
    if (!goal) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      const avg = goal.avg != null && !Number.isNaN(goal.avg) ? goal.avg : null;
      const g = await api.put<Goal>('/me/goal', {
        tier: goal.tier || null,
        avg,
        university: goal.university?.trim() || null,
        department: goal.department?.trim() || null,
      });
      setGoal({ tier: g.tier ?? null, avg: g.avg ?? null, university: g.university ?? null, department: g.department ?? null });
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally { setSaving(false); }
  };

  return (
    <div>
      <PageHeader title="목표 설정" sub="목표 평균을 정하면 약점 과목이 '할 일'로 자동 제안되고, 목표 대학·학과는 격차 리포트에 자동으로 채워져요." />
      <div style={{ marginBottom: 8 }}><Link to="/student/placement/gap" className="btn ghost" data-janus-cta="goal-to-report">격차 리포트 보기 →</Link></div>
      <ErrorText>{error}</ErrorText>
      {!goal ? <Spinner /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
          <Card title="내 목표">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <TextField label="목표 대학" placeholder="예) 성균관대" maxLength={60} value={goal.university ?? ''} onChange={(e) => set({ university: e.target.value })} />
              <TextField label="목표 학과" placeholder="예) 전자공학" maxLength={60} value={goal.department ?? ''} onChange={(e) => set({ department: e.target.value })} />
              <SelectField label="목표 라인(선택)" options={TIER_OPTIONS} value={goal.tier ?? ''} onChange={(e) => set({ tier: e.target.value || null })} />
              <TextField label="목표 평균 점수" type="number" min={0} max={100} step={1} placeholder="예) 90" hint="과목별 격차 계산과 '할 일' 자동 제안의 기준이에요(정수)." value={goal.avg ?? ''} onChange={(e) => set({ avg: e.target.value === '' ? null : Math.round(Number(e.target.value)) })} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                <Button onClick={save} disabled={saving} data-janus-cta="goal_save">{saving ? '저장 중…' : '목표 저장·리포트 갱신'}</Button>
                <button className="btn ghost" onClick={() => nav('/student/placement/gap')} data-janus-cta="goal-cancel">취소</button>
                {saved && <span style={{ fontSize: 13, color: 'var(--janus-signal-stable, #2e7d32)' }}>✓ 저장됐어요</span>}
              </div>
            </div>
          </Card>

          <Card title="목표는 이렇게 쓰여요">
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: 'var(--ink-body)', lineHeight: 1.7 }}>
              <li><b>과목별 격차</b> — 목표 평균까지 과목별로 얼마나 남았는지 바로 보여요(<Link to="/student/gap">과목별 격차 보기</Link>).</li>
              <li><b>맞춤 할 일</b> — 목표 평균에 못 미치는 과목이 '할 일'로 자동 제안돼요(<Link to="/student/tasks">할 일 보기</Link>).</li>
              <li><b>격차 리포트</b> — 목표 대학·학과가 리포트의 대학·학과 입력란에 자동으로 채워져요(목표 컷은 배치표에서 선택·입력).</li>
              <li><b>상담·컨설팅</b> — 선생님·컨설턴트가 같은 목표를 보고 전략을 잡아요.</li>
              <li>목표 평균을 비워 두면 과목별 '할 일' 제안이 만들어지지 않아요.</li>
            </ul>
            <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--muted)' }}>본 목표는 통계적 격차 계산의 기준일 뿐이며, 실제 합격을 보장하지 않아요.</div>
          </Card>
        </div>
      )}

      {/* 목표 후보 비교 — 학생이 직접 담은 후보 최대 3개를 같은 성적으로 나란히 비교(자동 제안 아님). */}
      <Card title="목표 후보 비교" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--ink-body)', marginBottom: 10 }}>
          목표를 바꿀지 고민될 때, 후보를 최대 3개까지 담아 지금 성적으로 각각 얼마나 남았는지 나란히 보세요.
          후보는 <b>직접 담은 것만</b> 표시돼요(시스템이 대학을 추천하지 않아요). 목표 컷은 <Link to="/student/placement/hub">배치표 허브</Link>에서 확인해 입력하세요.
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          {(['jeongsi', 'susi'] as Mode[]).map((m) => (
            <button key={m} className={mode === m ? 'btn' : 'btn ghost'} onClick={() => { setMode(m); setReport(null); }}>
              {m === 'jeongsi' ? '정시(전국누백)' : '수시(내신등급)'}
            </button>
          ))}
          {mode === 'susi' && (
            <input className="input" type="number" step="0.01" min={1} max={9} placeholder="내 내신 평균등급 (예: 2.3)"
              value={myGrade} onChange={(e) => setMyGrade(e.target.value)} style={{ maxWidth: 210 }} aria-label="내신 평균등급" />
          )}
        </div>

        <ErrorText>{candErr}</ErrorText>

        {/* 후보 담기 — 대학·학과·목표 컷(모드 단위) */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input className="input" placeholder="대학" value={form.univ} onChange={(e) => setForm({ ...form, univ: e.target.value })} maxLength={60} style={{ maxWidth: 160 }} aria-label="후보 대학" />
          <input className="input" placeholder="학과" value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })} maxLength={60} style={{ maxWidth: 160 }} aria-label="후보 학과" />
          <input className="input" type="number" step="0.01" placeholder={mode === 'susi' ? '목표 내신등급' : '목표 전국누백'} value={form.cut} onChange={(e) => setForm({ ...form, cut: e.target.value })} style={{ maxWidth: 170 }} aria-label="목표 컷" />
          {mode === 'jeongsi' && (
            <input className="input" placeholder="군(가/나/다)" value={form.track} onChange={(e) => setForm({ ...form, track: e.target.value })} maxLength={20} style={{ maxWidth: 120 }} aria-label="모집군" />
          )}
          <Button onClick={addCand} disabled={busy}>후보 담기</Button>
        </div>

        {cands === null ? <Spinner /> : cands.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>담은 후보가 없어요. 위에서 후보를 추가하면 밴드가 계산돼요.</div>
        ) : !report ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {mode === 'susi' && !myGrade.trim() ? '내신 평균등급을 입력하면 후보별 격차가 계산돼요.' : '계산 중…'}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: 'var(--ink-body)', marginBottom: 8 }}>
              내 {report.unit.label} <b>{report.myValue}{report.unit.suffix}</b> 기준 · 최신 회차 격차가 작은 순
              {report.spread && (
                <span style={{ color: 'var(--muted)' }}>
                  {' · '}최근 {report.spread.count}회 {report.spread.best}~{report.spread.worst}{report.unit.suffix}(변동 폭 {report.spread.spread})
                </span>
              )}
            </div>
            {/* 경고는 '흔들렸는가'가 아니라 '판정이 갈리는 후보가 있는가'로 분기한다(O108) —
                폭이 있어도 어느 후보도 안 갈리는 흔한 경우에 근거 없는 불안을 만들지 않게. */}
            {report.spread && report.spread.spread > 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>
                {report.flipCount > 0
                  ? `시험은 회차마다 흔들려요(컨디션·난이도). ${report.flipCount}곳은 어느 회차로 보느냐에 따라 판정이 갈려요.`
                  : '회차마다 흔들렸지만, 어느 회차로 봐도 후보들의 판정은 그대로예요.'}
                {report.smallSample ? ` 아직 ${report.spread.count}회뿐이라 추세로 보기엔 일러요.` : ''}
              </div>
            )}
            {report.volatilityNote && (
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>{report.volatilityNote}</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {report.candidates.map((c) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: BAND_COLOR[c.band] ?? 'var(--ink)', background: 'var(--surface-2, #f0f3f7)', borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>{c.band}</span>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 14, color: 'var(--ink)' }}>
                      <b>{c.univ} {c.dept}</b>{c.track ? <span style={{ color: 'var(--muted)' }}> · {c.track}군</span> : null}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                      목표 컷 {c.cut}{report.unit.suffix} · {c.shortfall > 0 ? `${c.shortfall} 부족` : '도달'}
                    </div>
                    {/* 뒤집히는 후보만 — 어느 회차가 어느 판정인지 숫자로 보여주면 학생이 자기 회차를 대입할 수 있다.
                        숫자(best/worst)는 후보 불변값이라 목록 레벨 spread 에서 온다(후보 행에 3중복으로 싣지 않는 이유). */}
                    {c.volatility && !c.volatility.consistent && report.spread && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        회차에 따라{' '}
                        <b style={{ color: BAND_COLOR[c.volatility.bestBand] ?? 'var(--ink)' }}>
                          {report.spread.best}{report.unit.suffix}면 {c.volatility.bestBand}
                        </b>
                        {' · '}
                        <b style={{ color: BAND_COLOR[c.volatility.worstBand] ?? 'var(--ink)' }}>
                          {report.spread.worst}{report.unit.suffix}면 {c.volatility.worstBand}
                        </b>
                      </div>
                    )}
                  </div>
                  <button className="btn ghost sm" onClick={() => promote(c)} disabled={busy}>이 후보로 목표 설정</button>
                  <button onClick={() => delCand(c.id)} aria-label="후보 삭제" style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>
                </div>
              ))}
            </div>

            {/* 합격률 힌트는 후보별이 아니라 목록 전체에 1회만(인접 후보 동일 수치 오독 방지). */}
            {report.admitHintNote && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--muted)' }}>{report.admitHintNote}</div>
            )}

            {report.evidence.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-body)', marginBottom: 4 }}>근거</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.7 }}>
                  {report.evidence.map((e, i) => (
                    <li key={i}>{e.claim} <span style={{ fontWeight: 700 }}>[{REL_LABEL[e.relTier] ?? e.relTier}]</span> <span style={{ opacity: 0.8 }}>— {e.source}</span></li>
                  ))}
                </ul>
              </div>
            )}
            <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--muted)' }}>{report.disclaimer} 컷에 도달해도 합격이 보장되지 않아요.</div>
          </>
        )}
      </Card>
    </div>
  );
}
