import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { PageHeader, Card, Button, Badge, ErrorText, EmptyState, SelectField } from '../components/ui';

// 수준진단 v1 — 시작 → 문항 풀이 → 채점 → 유형별 약점 → 처방. 문항은 데모(합성).
type Question = { id: string; subject: string; unit: string; difficulty: string | null; stem: string; choices: string[] };
type UnitStat = { subject: string; unit: string; total: number; correct: number; rate: number; weak: boolean };
type Prescription = { subject: string; unit: string; rate: number; action: string };
type Result = { attemptId: string; total: number; correct: number; score: number; units: UnitStat[]; prescriptions: Prescription[] };
type HistoryRow = { id: string; subject: string | null; total: number; correct: number; score: number; submitted_at: string; is_clinic?: boolean };
type ClinicAttempt = { id: string; total: number; correct: number; score: number; submittedAt: string; parentAttemptId: string | null };
type ClinicSummary = { attempts: ClinicAttempt[]; count: number; avgScore: number | null; bestScore: number | null; improvement: number | null };

const SUBJECTS = ['', '국어', '수학', '영어'];
const fmtDate = (s: string) => { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()}`; };

export function DiagnosticPage() {
  const [phase, setPhase] = useState<'intro' | 'quiz' | 'result'>('intro');
  const [subject, setSubject] = useState('');
  const [attemptId, setAttemptId] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [clinic, setClinic] = useState<ClinicSummary | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // 결과 텍스트 요약(공유·복사용) — 점수·유형별 정답률·처방.
  function resultSummary(r: Result): string {
    const lines = [
      `[야누스 수준진단 결과]`,
      `점수 ${r.score}점 · 정답 ${r.correct}/${r.total}`,
      ``,
      `▪ 유형별 정답률`,
      ...r.units.map((u) => `  - ${u.subject} ${u.unit}: ${u.rate}% (${u.correct}/${u.total})${u.weak ? ' ⚠약점' : ''}`),
    ];
    if (r.prescriptions.length) {
      lines.push(``, `▪ 처방(우선 보완)`);
      for (const p of r.prescriptions) lines.push(`  - ${p.subject} ${p.unit}(${p.rate}%): ${p.action}`);
    }
    return lines.join('\n');
  }
  async function shareResult(r: Result) {
    const text = resultSummary(r);
    try {
      if (navigator.share) { await navigator.share({ title: '야누스 수준진단 결과', text }); return; }
      await navigator.clipboard.writeText(text);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* 취소·미지원 무시 */ }
  }

  const loadHistory = () => {
    api.get<{ attempts: HistoryRow[] }>('/diagnostics/me').then((r) => setHistory(r.attempts)).catch(() => { /* 무시 */ });
    api.get<ClinicSummary>('/diagnostics/clinics').then(setClinic).catch(() => { /* 무시 */ });
  };
  useEffect(() => { loadHistory(); }, []);

  async function start() {
    setError(''); setBusy(true);
    try {
      const r = await api.post<{ attemptId: string; questions: Question[] }>('/diagnostics/start', { subject: subject || undefined });
      setAttemptId(r.attemptId); setQuestions(r.questions); setAnswers({}); setPhase('quiz');
    } catch (e) { setError(e instanceof ApiError ? e.message : '시작 실패'); }
    finally { setBusy(false); }
  }

  async function startClinic() {
    if (!result) return;
    setError(''); setBusy(true);
    try {
      const r = await api.post<{ attemptId: string; questions: Question[] }>('/diagnostics/clinic', { attemptId: result.attemptId });
      setAttemptId(r.attemptId); setQuestions(r.questions); setAnswers({}); setResult(null); setPhase('quiz');
    } catch (e) { setError(e instanceof ApiError ? e.message : '클리닉 시작 실패'); }
    finally { setBusy(false); }
  }

  async function submit() {
    setError(''); setBusy(true);
    try {
      const payload = { answers: questions.map((q) => ({ questionId: q.id, chosen: answers[q.id] ?? null })) };
      const r = await api.post<Result>(`/diagnostics/${attemptId}/submit`, payload);
      setResult(r); setPhase('result'); loadHistory();
    } catch (e) { setError(e instanceof ApiError ? e.message : '제출 실패'); }
    finally { setBusy(false); }
  }

  const answered = questions.filter((q) => answers[q.id] != null).length;

  return (
    <div>
      <PageHeader title="실력진단" sub="문항을 풀면 유형별 약점을 진단하고, 무엇을 보완할지 처방해줘요. (현재 문항은 데모 샘플)" />
      <ErrorText>{error}</ErrorText>

      {phase === 'intro' && (
        <>
          <Card style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ minWidth: 160 }}>
                <SelectField label="과목" value={subject} onChange={(e) => setSubject(e.target.value)}
                  options={SUBJECTS.map((s) => ({ value: s, label: s || '전과목' }))} />
              </div>
              <Button onClick={start} disabled={busy}>{busy ? '준비 중…' : '진단 시작'}</Button>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--caption)', marginTop: 10 }}>⚠ 데모 문항(합성)으로 동작해요. 실제 수능 문항은 후속 반영됩니다.</p>
          </Card>

          {history.length >= 2 && (
            <Card style={{ marginTop: 18 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>점수 추이 <span style={{ fontSize: 12, color: 'var(--caption)', fontWeight: 400 }}>(최근 {Math.min(10, history.length)}회)</span></div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 96 }}>
                {[...history].reverse().slice(-10).map((h) => (
                  <div key={h.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`${h.subject ?? '전과목'} ${h.score}점 · ${fmtDate(h.submitted_at)}`}>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{h.score}</span>
                    <div style={{ width: '100%', maxWidth: 34, height: `${Math.max(4, h.score * 0.72)}px`, borderRadius: 4, background: h.score >= 60 ? 'var(--j-blue)' : 'var(--danger, #dc2626)' }} />
                    <span style={{ fontSize: 9.5, color: 'var(--caption)' }}>{fmtDate(h.submitted_at)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {clinic && clinic.count >= 1 && (
            <Card style={{ marginTop: 18, borderLeft: '3px solid var(--j-blue)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>🎯 약점 클리닉 추이</span>
                <Badge kind="soft">{clinic.count}회</Badge>
                {clinic.improvement != null && clinic.count >= 2 && (
                  <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: clinic.improvement > 0 ? 'var(--j-stable)' : clinic.improvement < 0 ? 'var(--danger)' : 'var(--muted)' }}>
                    {clinic.improvement > 0 ? `▲ +${clinic.improvement}점 향상` : clinic.improvement < 0 ? `▼ ${clinic.improvement}점` : '변화 없음'}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                <div><div style={{ fontSize: 11, color: 'var(--caption)' }}>평균</div><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--j-blue)' }}>{clinic.avgScore ?? '—'}점</div></div>
                <div><div style={{ fontSize: 11, color: 'var(--caption)' }}>최고</div><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{clinic.bestScore ?? '—'}점</div></div>
              </div>
              {clinic.attempts.length >= 2 && (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 84 }}>
                  {clinic.attempts.slice(-10).map((a) => (
                    <div key={a.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`${a.score}점 (${a.correct}/${a.total}) · ${fmtDate(a.submittedAt)}`}>
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{a.score}</span>
                      <div style={{ width: '100%', maxWidth: 30, height: `${Math.max(4, a.score * 0.62)}px`, borderRadius: 4, background: a.score >= 60 ? 'var(--j-blue)' : 'var(--danger, #dc2626)' }} />
                      <span style={{ fontSize: 9.5, color: 'var(--caption)' }}>{fmtDate(a.submittedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
              {clinic.attempts.length < 2 && <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>클리닉을 반복하면 점수 변화를 추적해드려요.</p>}
            </Card>
          )}

          <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>이전 진단</h3>
          {history.length === 0 ? <EmptyState>아직 진단 기록이 없어요. 첫 진단을 시작해보세요.</EmptyState> : (
            <div style={{ display: 'grid', gap: 8 }}>
              {history.map((h) => (
                <Card key={h.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Badge kind={h.is_clinic ? 'new' : 'soft'}>{h.is_clinic ? '🎯 클리닉' : (h.subject ?? '전과목')}</Badge>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{h.score}점</span>
                    <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>정답 {h.correct}/{h.total}</span>
                    <span style={{ fontSize: 12, color: 'var(--caption)', marginLeft: 'auto' }}>{fmtDate(h.submitted_at)}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {phase === 'quiz' && (
        <>
          <div style={{ position: 'sticky', top: 0, background: 'var(--bg)', padding: '6px 0 10px', zIndex: 5, fontSize: 13, color: 'var(--muted)' }}>
            진행 {answered}/{questions.length}
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {questions.map((q, i) => (
              <Card key={q.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                  <Badge kind="new">{q.subject}</Badge><Badge kind="soft">{q.unit}</Badge>
                  {q.difficulty && <Badge kind="soft">{q.difficulty}</Badge>}
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>{i + 1}. {q.stem}</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {q.choices.map((c, idx) => (
                    <label key={idx} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 14,
                      border: `1px solid ${answers[q.id] === idx ? 'var(--j-blue)' : 'var(--line-soft)'}`,
                      background: answers[q.id] === idx ? 'var(--j-blue-soft)' : 'transparent',
                    }}>
                      <input type="radio" name={q.id} checked={answers[q.id] === idx} onChange={() => setAnswers((a) => ({ ...a, [q.id]: idx }))} />
                      {c}
                    </label>
                  ))}
                </div>
              </Card>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Button onClick={submit} disabled={busy || answered === 0}>{busy ? '채점 중…' : `제출하고 진단받기 (${answered}/${questions.length})`}</Button>
            <button onClick={() => setPhase('intro')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>취소</button>
          </div>
        </>
      )}

      {phase === 'result' && result && (
        <div className="diag-report">
          <Card style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 30, fontWeight: 800, color: 'var(--j-blue)' }}>{result.score}점</span>
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>정답 {result.correct} / {result.total}</span>
            </div>
          </Card>

          <h3 style={{ fontSize: 15, margin: '14px 0 8px' }}>유형별 정답률</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {result.units.map((u) => (
              <Card key={`${u.subject}-${u.unit}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Badge kind="soft">{u.subject}</Badge>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{u.unit}</span>
                  {u.weak && <Badge kind="danger">약점</Badge>}
                  <span style={{ marginLeft: 'auto', fontSize: 13, color: u.weak ? 'var(--danger, #dc2626)' : 'var(--muted)' }}>{u.rate}% ({u.correct}/{u.total})</span>
                </div>
                <div style={{ height: 6, borderRadius: 4, background: 'var(--line-soft)', marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${u.rate}%`, height: '100%', background: u.weak ? 'var(--danger, #dc2626)' : 'var(--j-blue)' }} />
                </div>
              </Card>
            ))}
          </div>

          {result.prescriptions.length > 0 && (
            <>
              <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>처방 — 이걸 먼저 보완하세요</h3>
              <div style={{ display: 'grid', gap: 8 }}>
                {result.prescriptions.map((p, i) => (
                  <Card key={i} style={{ borderLeft: '3px solid var(--j-blue)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                      <Badge kind="new">{p.subject}</Badge><Badge kind="soft">{p.unit}</Badge>
                      <span style={{ fontSize: 12, color: 'var(--danger, #dc2626)' }}>정답률 {p.rate}%</span>
                    </div>
                    <div style={{ fontSize: 13.5, color: 'var(--ink)', marginBottom: 8 }}>{p.action}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Link to={`/student/community/board?subject=${encodeURIComponent(p.subject)}`} className="btn sm outline" style={{ textDecoration: 'none' }}>이 과목 질문하기</Link>
                      <Link to={`/student/materials?subject=${encodeURIComponent(p.subject)}`} className="btn sm outline" style={{ textDecoration: 'none' }}>자료 찾기</Link>
                      <Link to={`/student/lectures?subject=${encodeURIComponent(p.subject)}`} className="btn sm outline" style={{ textDecoration: 'none' }}>강좌 보기</Link>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
          {result.prescriptions.length === 0 && <p style={{ fontSize: 13.5, color: 'var(--brand)', marginTop: 14 }}>약점 유형이 없어요 — 훌륭해요! 다른 과목도 진단해보세요.</p>}

          <div className="no-print" style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {result.prescriptions.length > 0 && <Button onClick={startClinic} disabled={busy}>{busy ? '준비 중…' : '🎯 약점만 다시 풀기'}</Button>}
            <button onClick={() => shareResult(result)} style={{ background: 'none', border: '1px solid var(--line-soft)', borderRadius: 8, padding: '9px 16px', color: 'var(--ink)', cursor: 'pointer' }}>{copied ? '복사됨 ✓' : '결과 공유'}</button>
            <button onClick={() => window.print()} style={{ background: 'none', border: '1px solid var(--line-soft)', borderRadius: 8, padding: '9px 16px', color: 'var(--ink)', cursor: 'pointer' }}>PDF 저장·인쇄</button>
            <button onClick={() => { setPhase('intro'); setResult(null); }} style={{ background: 'none', border: '1px solid var(--line-soft)', borderRadius: 8, padding: '9px 16px', color: 'var(--muted)', cursor: 'pointer' }}>다시 진단하기</button>
          </div>
        </div>
      )}
    </div>
  );
}
