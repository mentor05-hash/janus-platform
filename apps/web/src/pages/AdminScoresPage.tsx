import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, Spinner, ErrorText, EmptyState } from '../components/ui';

type Item = { subject: string; score: number | null; maxScore: number | null; grade?: string | null };
type Report = { id: string; studentName: string; loginId: string; period: string; examType: string | null; source: string; items: Item[]; avg: number | null };
type Missing = { period: string; count: number; students: { studentId: string; name: string; loginId: string; center: string | null; schoolGrade: string | null }[] };

const DEFAULT_SUBJECTS = ['국어', '수학', '영어', '과학', '사회'];

export function AdminScoresPage() {
  const [period, setPeriod] = useState('2026-1학기 중간고사');
  const [periods, setPeriods] = useState<string[]>([]);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [tab, setTab] = useState<'list' | 'missing'>('list');
  const [missing, setMissing] = useState<Missing | null>(null);
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

  const loadPeriods = useCallback(() => { api.get<string[]>('/admin/scores/periods').then(setPeriods).catch(() => {}); }, []);
  const loadList = useCallback(() => {
    setReports(null);
    api.get<Report[]>(`/admin/scores?period=${encodeURIComponent(period)}`).then(setReports).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, [period]);
  const loadMissing = useCallback(() => {
    setMissing(null);
    api.get<Missing>(`/admin/scores/missing?period=${encodeURIComponent(period)}`).then(setMissing).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
  }, [period]);

  useEffect(() => { loadPeriods(); }, [loadPeriods]);
  useEffect(() => { tab === 'list' ? loadList() : loadMissing(); }, [tab, loadList, loadMissing]);

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
      </div>

      {/* 엑셀 일괄 */}
      <Card style={{ marginBottom: 12 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>엑셀 일괄 업로드</h3>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
          가로형: <b>아이디 · 기간 · 시험</b> + 과목 컬럼(국어·수학·영어…). 전체 또는 일부 학생만 넣어도 됩니다. 같은 학생·기간은 갱신됩니다.
        </p>
        <input ref={excelRef} type="file" accept=".xlsx,.xls" hidden onChange={onExcel} />
        <Button variant="ghost" onClick={() => excelRef.current?.click()}>엑셀 파일 선택(.xlsx)</Button>
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

      {/* 탭 */}
      <div style={{ display: 'inline-flex', background: 'var(--fill,#eef2f4)', borderRadius: 10, padding: 3, marginBottom: 12 }}>
        {([['list', '성적 목록'], ['missing', '미업로드 학생']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} style={{ border: 'none', cursor: 'pointer', padding: '7px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, background: tab === v ? 'var(--surface)' : 'transparent', color: tab === v ? 'var(--teal)' : 'var(--muted)' }}>{l}</button>
        ))}
      </div>

      {tab === 'list' ? (
        reports === null ? <Spinner /> : reports.length === 0 ? <Card><EmptyState>이 기간에 등록된 성적이 없어요.</EmptyState></Card> : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>학생</th><th style={th}>시험</th><th style={th}>과목·점수</th><th style={th}>평균</th><th style={th}>출처</th></tr></thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td style={td}><b>{r.studentName}</b> <span style={{ color: 'var(--muted)', fontSize: 12 }}>{r.loginId}</span></td>
                    <td style={td}>{r.examType ?? '-'}</td>
                    <td style={{ ...td, fontSize: 12 }}>{r.items.map((i) => `${i.subject} ${i.score ?? '-'}`).join(' · ')}</td>
                    <td style={td}><b>{r.avg ?? '-'}</b></td>
                    <td style={td}><Badge kind="soft">{r.source === 'excel' ? '엑셀' : r.source === 'ocr' ? 'OCR' : '수동'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      ) : (
        missing === null ? <Spinner /> : (
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
      )}
    </div>
  );
}
