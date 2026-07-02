import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isHq } from '../auth/roleHome';
import { PageHeader, Card, Button, Badge, ErrorText, EmptyState, SkeletonList } from '../components/ui';
import { ScoreTrend, TIER_KIND, type Placement, type Trend } from '../components/ScoreTrend';

type Item = { subject: string; score: number | null; maxScore: number | null; grade?: string | null };
type Report = { id: string; studentName: string; loginId: string; period: string; examType: string | null; source: string; items: Item[]; avg: number | null; placement: Placement };
type Missing = { period: string; count: number; students: { studentId: string; name: string; loginId: string; center: string | null; schoolGrade: string | null }[] };
type Policy = { student: boolean; guardian: boolean; placement: boolean };
type Stats = {
  period: string | null; totalStudents: number; uploaded: number; coverage: number; avgMean: number | null;
  goalMet: number; goalTotal: number;
  distribution: { bucket: string; count: number }[];
  subjects: { subject: string; avg: number; count: number }[];
  tiers: { tier: string; count: number }[];
  movement: { prevPeriod: string | null; improved: number; declined: number; same: number; avgDelta: number | null };
};

const DEFAULT_SUBJECTS = ['국어', '수학', '영어', '과학', '사회'];

export function AdminScoresPage() {
  const { user } = useAuth();
  const master = isHq(user); // 본사 마스터관리자만 정책 편집
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [period, setPeriod] = useState('2026-1학기 기말고사');
  const [periods, setPeriods] = useState<string[]>([]);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [tab, setTab] = useState<'list' | 'missing' | 'stats'>('list');
  const [missing, setMissing] = useState<Missing | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // 수동/OCR 입력 폼
  const [loginId, setLoginId] = useState('');
  const [examType, setExamType] = useState('중간');
  const [items, setItems] = useState<Item[]>(DEFAULT_SUBJECTS.map((s) => ({ subject: s, score: null, maxScore: 100 })));
  const [reportFileId, setReportFileId] = useState<string | undefined>();
  const [ocrNote, setOcrNote] = useState('');
  const excelRef = useRef<HTMLInputElement>(null);
  const ocrRef = useRef<HTMLInputElement>(null);

  // 성적·배치 추이
  const [trendId, setTrendId] = useState('');
  const [trend, setTrend] = useState<Trend | null>(null);
  const [goalTier, setGoalTier] = useState('');
  const [goalAvg, setGoalAvg] = useState('');
  // 배치 수동 입력(관리자/배치표 서비스 결과)
  const [plReport, setPlReport] = useState<Report | null>(null);
  const [pl, setPl] = useState({ tier: '', line: '', universities: '', departments: '' });

  async function saveGoal() {
    if (!trendId.trim()) return;
    setMsg(''); setError('');
    try { await api.post('/admin/scores/goal', { studentLoginId: trendId.trim(), tier: goalTier || null, avg: goalAvg ? Number(goalAvg) : null }); setMsg('목표가 저장되었습니다.'); loadTrend(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '목표 저장 실패'); }
  }
  function openPlacement(r: Report) {
    setPlReport(r);
    const p = r.placement;
    setPl({ tier: p?.tier ?? '', line: p?.line ?? '', universities: (p?.universities ?? []).join(', '), departments: (p?.departments ?? []).join(', ') });
  }
  async function savePlacement() {
    if (!plReport) return;
    setMsg(''); setError('');
    try {
      await api.post(`/admin/scores/${plReport.id}/placement`, {
        tier: pl.tier || undefined, line: pl.line || undefined, source: 'manual',
        universities: pl.universities ? pl.universities.split(',').map((x) => x.trim()).filter(Boolean) : [],
        departments: pl.departments ? pl.departments.split(',').map((x) => x.trim()).filter(Boolean) : [],
      });
      setPlReport(null); setMsg('배치 라인이 저장되었습니다.'); loadList(); if (trend) loadTrend();
    } catch (e) { setError(e instanceof ApiError ? e.message : '배치 저장 실패'); }
  }

  async function loadTrend() {
    if (!trendId.trim()) return;
    setError(''); setTrend(null);
    try {
      const t = await api.get<Trend>(`/admin/scores/trend?studentLoginId=${encodeURIComponent(trendId.trim())}`);
      setTrend(t); setGoalTier(t.goal?.tier ?? ''); setGoalAvg(t.goal?.avg != null ? String(t.goal.avg) : '');
    } catch (e) { setError(e instanceof ApiError ? e.message : '추이 조회 실패'); }
  }
  async function downloadTemplate() {
    try { await api.downloadPath('/admin/scores/template', 'score-template.xlsx'); }
    catch (e) { setError(e instanceof ApiError ? e.message : '템플릿 다운로드 실패'); }
  }
  async function downloadCsv() {
    try { await api.downloadPath(`/admin/scores/export?period=${encodeURIComponent(period)}`, `scores-${period}.csv`); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'CSV 내보내기 실패'); }
  }
  async function estimatePlacements() {
    setMsg(''); setError('');
    try { const r = await api.post<{ updated: number; note: string }>('/admin/scores/estimate-placements', { period }); setMsg(`배치 라인 추정 완료: ${r.updated}건 (${r.note})`); if (tab === 'list') loadList(); if (trend) loadTrend(); }
    catch (e) { setError(e instanceof ApiError ? e.message : '추정 실패'); }
  }

  const loadPeriods = useCallback(() => { api.get<string[]>('/admin/scores/periods').then(setPeriods).catch(() => {}); }, []);
  const loadList = useCallback(() => {
    setReports(null);
    api.get<Report[]>(`/admin/scores?period=${encodeURIComponent(period)}`).then(setReports).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, [period]);
  const loadMissing = useCallback(() => {
    setMissing(null);
    api.get<Missing>(`/admin/scores/missing?period=${encodeURIComponent(period)}`).then(setMissing).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, [period]);
  const loadStats = useCallback(() => {
    setStats(null);
    api.get<Stats>(`/admin/scores/stats?period=${encodeURIComponent(period)}`).then(setStats).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, [period]);

  useEffect(() => { loadPeriods(); api.get<Policy>('/admin/scores/policy').then(setPolicy).catch(() => {}); }, [loadPeriods]);
  useEffect(() => { tab === 'list' ? loadList() : tab === 'missing' ? loadMissing() : loadStats(); }, [tab, loadList, loadMissing, loadStats]);

  async function togglePolicy(k: keyof Policy) {
    if (!master || !policy) return;
    setError(''); setMsg('');
    try { const r = await api.put<Policy>('/admin/scores/policy', { [k]: !policy[k] }); setPolicy(r); setMsg('노출 정책이 저장되었습니다.'); }
    catch (e) { setError(e instanceof ApiError ? e.message : '정책 변경 실패'); }
  }

  async function onExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setMsg(''); setError('');
    try {
      const form = new FormData(); form.append('file', file, file.name);
      const r = await api.upload<{ created: number; updated: number; skipped: number; errors: string[] }>('/admin/scores/excel', form);
      setMsg(`엑셀 업로드: 신규 ${r.created} · 갱신 ${r.updated} · 건너뜀 ${r.skipped}${r.errors.length ? ` (${r.errors.slice(0, 2).join(' / ')}${r.errors.length > 2 ? '…' : ''})` : ''}`);
      loadPeriods(); loadList();
    } catch (er) { setError(er instanceof ApiError ? er.message : '엑셀 업로드 실패'); }
  }

  async function onOcr(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setMsg(''); setError(''); setOcrNote('OCR 처리 중…');
    try {
      const form = new FormData(); form.append('file', file, file.name);
      const up = await api.upload<{ id: string }>('/files', form);
      const r = await api.post<{ demo: boolean; period?: string; examType?: string; items: Item[]; note: string; fileId: string }>('/admin/scores/ocr', { fileId: up.id });
      setReportFileId(r.fileId);
      if (r.items.length) setItems(r.items.map((i) => ({ subject: i.subject, score: i.score ?? null, maxScore: i.maxScore ?? 100, grade: i.grade ?? null })));
      if (r.examType) setExamType(r.examType);
      setOcrNote(r.note);
    } catch (er) { setOcrNote(''); setError(er instanceof ApiError ? er.message : 'OCR 실패'); }
  }

  const setItem = (i: number, k: keyof Item, v: string) => setItems((p) => p.map((it, idx) => idx === i ? { ...it, [k]: k === 'subject' || k === 'grade' ? v : (v === '' ? null : Number(v)) } : it));

  async function saveManual() {
    setMsg(''); setError('');
    if (!loginId.trim()) { setError('학생 아이디를 입력하세요.'); return; }
    try {
      await api.post('/admin/scores/manual', {
        studentLoginId: loginId.trim(), period, examType,
        reportFileId,
        items: items.filter((i) => i.subject.trim() && i.score != null),
      });
      setMsg(`${loginId} 성적 저장됨.`);
      setLoginId(''); setReportFileId(undefined); setOcrNote(''); setItems(DEFAULT_SUBJECTS.map((s) => ({ subject: s, score: null, maxScore: 100 })));
      loadPeriods(); if (tab === 'list') loadList(); else loadMissing();
    } catch (e) { setError(e instanceof ApiError ? e.message : '저장 실패'); }
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'var(--fill,#f6f8fa)' };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderTop: '1px solid var(--line)' };

  return (
    <div>
      <PageHeader title="성적 업로드" sub="엑셀 일괄 · 수동 입력 · 성적표 OCR · 기간별 미업로드 학생 확인" />
      {msg && <p style={{ color: 'var(--chip-done)', fontSize: 13 }}>{msg}</p>}
      <ErrorText>{error}</ErrorText>

      {/* 기간 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <label className="label" style={{ margin: 0 }}>기간</label>
        <input className="input" style={{ width: 220 }} value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="예: 2026-1학기 중간고사" list="periods" />
        <datalist id="periods">{periods.map((p) => <option key={p} value={p} />)}</datalist>
        <Button size="sm" variant="ghost" onClick={estimatePlacements}>🎯 배치 라인 추정(데모)</Button>
        <Button size="sm" variant="ghost" onClick={downloadCsv}>⬇ CSV 내보내기</Button>
      </div>

      {/* 노출 정책(본사 마스터) */}
      {policy && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>성적·배치 노출 정책</h3>
            <Badge kind={master ? 'confirmed' : 'soft'}>{master ? '본사 마스터 편집 가능' : '본사 마스터 전용'}</Badge>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {([['student', '학생 앱 노출'], ['guardian', '학부모 앱 노출'], ['placement', '배치 라인(대학·학과) 노출']] as const).map(([k, label]) => (
              <button key={k} disabled={!master} onClick={() => togglePolicy(k)} style={{
                cursor: master ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10,
                border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 13, fontWeight: 600, opacity: master ? 1 : 0.7,
              }}>
                <span>{label}</span>
                <span style={{ width: 34, height: 20, borderRadius: 999, background: policy[k] ? 'var(--teal)' : 'var(--line)', position: 'relative', transition: '.15s' }}>
                  <span style={{ position: 'absolute', top: 2, left: policy[k] ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--surface)', transition: '.15s' }} />
                </span>
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>학생·학부모 앱에서 성적/배치 추이를 볼 수 있는지 전사(全社) 단위로 제어합니다. 관리자·선생님은 항상 열람합니다.</p>
        </Card>
      )}

      {/* 엑셀 일괄 */}
      <Card style={{ marginBottom: 12 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>엑셀 일괄 업로드</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
          가로형: <b>아이디 · 기간 · 시험</b> + 과목 컬럼(국어·수학·영어…). 전체 또는 일부 학생만 넣어도 됩니다. 같은 학생·기간은 갱신됩니다.
        </p>
        <input ref={excelRef} type="file" accept=".xlsx,.xls" hidden onChange={onExcel} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => excelRef.current?.click()}>엑셀 파일 선택(.xlsx)</Button>
          <Button variant="ghost" onClick={downloadTemplate}>⬇ 템플릿 다운로드</Button>
        </div>
      </Card>

      {/* 수동 + OCR */}
      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>수동 입력 / 성적표 OCR</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <input className="input" style={{ width: 150 }} value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="학생 아이디" />
          <select className="input" style={{ width: 120 }} value={examType} onChange={(e) => setExamType(e.target.value)}>
            {['중간', '기말', '모의고사', '수행'].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <input ref={ocrRef} type="file" accept="image/*" hidden onChange={onOcr} />
          <Button variant="ghost" onClick={() => ocrRef.current?.click()}>📷 성적표 이미지 OCR</Button>
        </div>
        {ocrNote && <p style={{ fontSize: 12, color: 'var(--chip-confirmed)', background: 'var(--chip-confirmed-bg,#FEF6E7)', borderRadius: 8, padding: '7px 10px', margin: '0 0 10px' }}>ℹ️ {ocrNote}</p>}
        <div style={{ display: 'grid', gap: 6 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input className="input" style={{ width: 110 }} value={it.subject} onChange={(e) => setItem(i, 'subject', e.target.value)} placeholder="과목" />
              <input className="input" style={{ width: 90 }} type="number" value={it.score ?? ''} onChange={(e) => setItem(i, 'score', e.target.value)} placeholder="점수" />
              <span style={{ color: 'var(--caption)', fontSize: 12 }}>/</span>
              <input className="input" style={{ width: 80 }} type="number" value={it.maxScore ?? ''} onChange={(e) => setItem(i, 'maxScore', e.target.value)} placeholder="만점" />
              <input className="input" style={{ width: 80 }} value={it.grade ?? ''} onChange={(e) => setItem(i, 'grade', e.target.value)} placeholder="등급" />
              <button onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))} style={{ border: 'none', background: 'none', color: 'var(--chip-danger)', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
          ))}
          <div><Button size="sm" variant="ghost" onClick={() => setItems((p) => [...p, { subject: '', score: null, maxScore: 100 }])}>＋ 과목 추가</Button></div>
        </div>
        <Button style={{ marginTop: 10 }} onClick={saveManual}>성적 저장</Button>
      </Card>

      {/* 성적·배치 추이 */}
      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>성적·배치 추이</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>학생별 성적 추이와 함께, 배치표 서비스로 도출된 <b>가능 대학·학과 라인의 변화</b>를 확인합니다.</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <input className="input" style={{ width: 150 }} value={trendId} onChange={(e) => setTrendId(e.target.value)} placeholder="학생 아이디" onKeyDown={(e) => e.key === 'Enter' && loadTrend()} />
          <Button variant="ghost" onClick={loadTrend}>추이 보기</Button>
        </div>
        {trend && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{trend.student.name} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{trend.student.loginId}</span></div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>목표</span>
              <input className="input" style={{ width: 150 }} value={goalTier} onChange={(e) => setGoalTier(e.target.value)} placeholder="목표 라인(예: 인서울 상위)" />
              <input className="input" style={{ width: 90 }} type="number" value={goalAvg} onChange={(e) => setGoalAvg(e.target.value)} placeholder="목표 평균" />
              <Button size="sm" variant="ghost" onClick={saveGoal}>목표 저장</Button>
            </div>
            <ScoreTrend trend={trend} />
          </>
        )}
      </Card>

      {/* 탭 */}
      <div style={{ display: 'inline-flex', background: 'var(--fill,#eef2f4)', borderRadius: 10, padding: 3, marginBottom: 12 }}>
        {([['list', '성적 목록'], ['missing', '미업로드 학생'], ['stats', '📊 성적 통계']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} style={{ border: 'none', cursor: 'pointer', padding: '7px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, background: tab === v ? 'var(--surface)' : 'transparent', color: tab === v ? 'var(--teal)' : 'var(--muted)' }}>{l}</button>
        ))}
      </div>

      {tab === 'list' ? (
        reports === null ? <SkeletonList rows={4} /> : reports.length === 0 ? <Card><EmptyState>이 기간에 등록된 성적이 없어요.</EmptyState></Card> : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>학생</th><th style={th}>시험</th><th style={th}>과목·점수</th><th style={th}>평균</th><th style={th}>배치 라인</th><th style={th}>출처</th></tr></thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td style={td}><b>{r.studentName}</b> <span style={{ color: 'var(--muted)', fontSize: 12 }}>{r.loginId}</span></td>
                    <td style={td}>{r.examType ?? '-'}</td>
                    <td style={{ ...td, fontSize: 12 }}>{r.items.map((i) => `${i.subject} ${i.score ?? '-'}`).join(' · ')}</td>
                    <td style={td}><b>{r.avg ?? '-'}</b></td>
                    <td style={{ ...td, fontSize: 12 }}>
                      {r.placement ? <><Badge kind={TIER_KIND[r.placement.tier ?? ''] ?? 'soft'}>{r.placement.tier}</Badge> <span style={{ color: 'var(--muted)' }}>{r.placement.line}</span></> : <span style={{ color: 'var(--caption)' }}>-</span>}
                      <button onClick={() => openPlacement(r)} title="배치 입력" style={{ marginLeft: 6, border: 'none', background: 'none', color: 'var(--teal)', cursor: 'pointer', fontSize: 12 }}>✎</button>
                    </td>
                    <td style={td}><Badge kind="soft">{r.source === 'excel' ? '엑셀' : r.source === 'ocr' ? 'OCR' : '수동'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      ) : tab === 'missing' ? (
        missing === null ? <SkeletonList rows={4} /> : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
              <b>{missing.period}</b> 미업로드 <Badge kind={missing.count > 0 ? 'danger' : 'done'}>{missing.count}명</Badge>
            </div>
            {missing.students.length === 0 ? <EmptyState>모든 학생이 업로드되었어요 🎉</EmptyState> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>학생</th><th style={th}>아이디</th><th style={th}>학년</th><th style={th}>센터</th><th style={th} /></tr></thead>
                <tbody>
                  {missing.students.map((s) => (
                    <tr key={s.studentId}>
                      <td style={td}><b>{s.name}</b></td>
                      <td style={{ ...td, color: 'var(--muted)' }}>{s.loginId}</td>
                      <td style={td}>{s.schoolGrade ?? '-'}</td>
                      <td style={td}>{s.center ?? '-'}</td>
                      <td style={{ ...td, textAlign: 'right' }}><Button size="sm" variant="ghost" onClick={() => { setLoginId(s.loginId); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>입력</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )
      ) : (
        stats === null ? <SkeletonList rows={3} /> : !stats.period ? <Card><EmptyState>집계할 성적 데이터가 없어요.</EmptyState></Card> : <StatsView s={stats} />
      )}

      {/* 배치 라인 수동 입력(관리자/배치표 서비스 결과) */}
      {plReport && (
        <div onClick={() => setPlReport(null)} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(8,16,20,0.5)', display: 'grid', placeItems: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 460 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>배치 라인 입력</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>{plReport.studentName} · {plReport.period}{plReport.avg != null ? ` · 평균 ${plReport.avg}` : ''}</p>
            <div style={{ display: 'grid', gap: 8 }}>
              <div><label className="label">등급/티어</label><input className="input" value={pl.tier} onChange={(e) => setPl({ ...pl, tier: e.target.value })} placeholder="예: 상위" /></div>
              <div><label className="label">라인</label><input className="input" value={pl.line} onChange={(e) => setPl({ ...pl, line: e.target.value })} placeholder="예: 서성한·중경외시 라인" /></div>
              <div><label className="label">대학(쉼표 구분)</label><input className="input" value={pl.universities} onChange={(e) => setPl({ ...pl, universities: e.target.value })} placeholder="성균관대, 한양대, 중앙대" /></div>
              <div><label className="label">학과(쉼표 구분)</label><input className="input" value={pl.departments} onChange={(e) => setPl({ ...pl, departments: e.target.value })} placeholder="전자공학, 경영" /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <Button onClick={savePlacement}>저장</Button>
              <Button variant="ghost" onClick={() => setPlReport(null)}>취소</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 관리자 성적 통계 뷰 — 커버리지·평균·분포·과목·배치·향상. */
function StatsView({ s }: { s: Stats }) {
  const maxDist = Math.max(1, ...s.distribution.map((d) => d.count));
  const maxSubj = 100;
  const movTotal = s.movement.improved + s.movement.declined + s.movement.same;
  const kpi = (label: string, value: React.ReactNode, sub?: string) => (
    <div style={{ flex: '1 1 160px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--caption)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {kpi('업로드 커버리지', `${s.coverage}%`, `${s.uploaded} / ${s.totalStudents}명`)}
        {kpi('평균 점수', s.avgMean ?? '-', `${s.period}`)}
        {kpi('목표 달성', `${s.goalMet}`, s.goalTotal ? `목표 설정 ${s.goalTotal}명 중` : '목표 설정 학생 없음')}
        {kpi('직전 대비 평균', s.movement.avgDelta == null ? '-' : `${s.movement.avgDelta > 0 ? '▲' : s.movement.avgDelta < 0 ? '▼' : ''}${Math.abs(s.movement.avgDelta)}`, s.movement.prevPeriod ? `vs ${s.movement.prevPeriod}` : '직전 기간 없음')}
      </div>

      <Card title="평균 점수 분포">
        <div style={{ display: 'grid', gap: 8 }}>
          {s.distribution.map((d) => (
            <div key={d.bucket} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 56, fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>{d.bucket}</span>
              <div style={{ flex: 1, background: 'var(--fill,#eef2f4)', borderRadius: 6, height: 22, overflow: 'hidden' }}>
                <div style={{ width: `${(d.count / maxDist) * 100}%`, height: '100%', background: 'var(--teal)', borderRadius: 6, transition: 'width .3s' }} />
              </div>
              <span style={{ width: 40, fontSize: 12, fontWeight: 700 }}>{d.count}명</span>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        <Card title="과목별 평균">
          {s.subjects.length === 0 ? <EmptyState>데이터 없음</EmptyState> : (
            <div style={{ display: 'grid', gap: 8 }}>
              {s.subjects.map((sub) => (
                <div key={sub.subject} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 56, fontSize: 12, fontWeight: 700 }}>{sub.subject}</span>
                  <div style={{ flex: 1, background: 'var(--fill,#eef2f4)', borderRadius: 6, height: 22, overflow: 'hidden' }}>
                    <div style={{ width: `${(sub.avg / maxSubj) * 100}%`, height: '100%', background: sub.avg >= 80 ? '#2F9E44' : sub.avg >= 70 ? 'var(--teal)' : sub.avg >= 60 ? '#F08C00' : '#E5484D', borderRadius: 6 }} />
                  </div>
                  <span style={{ width: 40, fontSize: 12, fontWeight: 700 }}>{sub.avg}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="배치 라인(티어) 분포">
          {s.tiers.length === 0 ? <EmptyState>배치 데이터 없음 — 배치 추정 실행 후 표시</EmptyState> : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {s.tiers.map((t) => (
                <div key={t.tier} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--line)', borderRadius: 999, padding: '6px 12px' }}>
                  <Badge kind={TIER_KIND[t.tier] ?? 'soft'}>{t.tier}</Badge>
                  <b style={{ fontSize: 14 }}>{t.count}</b><span style={{ fontSize: 12, color: 'var(--muted)' }}>명</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title={`직전 기간 대비 변화${s.movement.prevPeriod ? ` (vs ${s.movement.prevPeriod})` : ''}`}>
        {!s.movement.prevPeriod || movTotal === 0 ? <EmptyState>비교할 직전 기간 데이터가 없어요.</EmptyState> : (
          <>
            <div style={{ display: 'flex', height: 26, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)' }}>
              {s.movement.improved > 0 && <div style={{ width: `${(s.movement.improved / movTotal) * 100}%`, background: '#2F9E44', color: '#fff', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>▲{s.movement.improved}</div>}
              {s.movement.same > 0 && <div style={{ width: `${(s.movement.same / movTotal) * 100}%`, background: 'var(--line)', color: 'var(--ink)', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>={s.movement.same}</div>}
              {s.movement.declined > 0 && <div style={{ width: `${(s.movement.declined / movTotal) * 100}%`, background: '#E5484D', color: '#fff', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center' }}>▼{s.movement.declined}</div>}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              <span><b style={{ color: '#2F9E44' }}>▲ 향상 {s.movement.improved}명</b></span>
              <span>= 유지 {s.movement.same}명</span>
              <span><b style={{ color: '#E5484D' }}>▼ 하락 {s.movement.declined}명</b></span>
              <span style={{ marginLeft: 'auto' }}>두 기간 모두 업로드된 {movTotal}명 기준</span>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
