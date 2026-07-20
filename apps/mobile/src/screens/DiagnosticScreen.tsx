import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { SP, useTheme, useUI, type Palette } from '../theme';

/* 실력진단 모바일 뷰(N30) — 웹 DiagnosticPage 파리티: 시작 → 문항 풀이 → 채점 → 유형별 약점 → 처방 → 약점 클리닉. */

type Question = { id: string; subject: string; unit: string; difficulty: string | null; stem: string; choices: string[] };
type UnitStat = { subject: string; unit: string; total: number; correct: number; rate: number; weak: boolean };
type Prescription = { subject: string; unit: string; rate: number; action: string };
type Result = { attemptId: string; total: number; correct: number; score: number; units: UnitStat[]; prescriptions: Prescription[] };
type HistoryRow = { id: string; subject: string | null; total: number; correct: number; score: number; submitted_at: string; is_clinic?: boolean };

const SUBJECTS = ['', '국어', '수학', '영어'];
const fmtDate = (s: string) => { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()}`; };

export function DiagnosticScreen({ onGoQna }: { onGoQna?: () => void }) {
  const { C } = useTheme();
  const ui = useUI();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [phase, setPhase] = useState<'intro' | 'quiz' | 'result'>('intro');
  const [subject, setSubject] = useState('');
  const [attemptId, setAttemptId] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadHistory = () => api.get<{ attempts: HistoryRow[] }>('/diagnostics/me').then((r) => setHistory(r.attempts)).catch(() => {});
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
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={ui.h}>실력진단</Text>
      <Text style={styles.sub}>문항을 풀면 유형별 약점을 진단하고, 무엇을 보완할지 처방해줘요. (문항은 데모 샘플)</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}

      {phase === 'intro' && (
        <>
          <View style={[ui.card, { marginTop: SP.md }]}>
            <Text style={styles.lbl}>과목</Text>
            <View style={styles.pills}>
              {SUBJECTS.map((s) => (
                <TouchableOpacity key={s || 'all'} style={[styles.pill, subject === s && styles.pillOn]} onPress={() => setSubject(s)}>
                  <Text style={[styles.pillT, subject === s && { color: C.white }]}>{s || '전과목'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.primary} disabled={busy} onPress={start}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryT}>진단 시작</Text>}
            </TouchableOpacity>
          </View>

          {history.length >= 2 && (
            <View style={[ui.card, { marginTop: SP.md }]}>
              <Text style={styles.secT}>점수 추이 (최근 {Math.min(10, history.length)}회)</Text>
              <View style={styles.chart}>
                {[...history].reverse().slice(-10).map((h) => (
                  <View key={h.id} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
                    <Text style={styles.chartN}>{h.score}</Text>
                    <View style={{ width: '70%', maxWidth: 30, height: Math.max(4, h.score * 0.6), borderRadius: 4, backgroundColor: h.score >= 60 ? C.teal : '#dc2626' }} />
                    <Text style={styles.chartD}>{fmtDate(h.submitted_at)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <Text style={styles.secHead}>이전 진단</Text>
          {history.length === 0 ? <Text style={ui.sub}>아직 진단 기록이 없어요. 첫 진단을 시작해보세요.</Text> : history.slice(0, 10).map((h) => (
            <View key={h.id} style={[ui.card, styles.row]}>
              <Text style={styles.badge}>{h.is_clinic ? '🎯 클리닉' : (h.subject ?? '전과목')}</Text>
              <Text style={styles.score}>{h.score}점</Text>
              <Text style={styles.dim}>정답 {h.correct}/{h.total}</Text>
              <Text style={[styles.dim, { marginLeft: 'auto' }]}>{fmtDate(h.submitted_at)}</Text>
            </View>
          ))}
        </>
      )}

      {phase === 'quiz' && (
        <>
          <Text style={[styles.secT, { marginTop: SP.md }]}>진행 {answered}/{questions.length}</Text>
          {questions.map((q, i) => (
            <View key={q.id} style={[ui.card, { marginTop: 10 }]}>
              <Text style={styles.dim}>{q.subject} · {q.unit}{q.difficulty ? ` · ${q.difficulty}` : ''}</Text>
              <Text style={styles.stem}>{i + 1}. {q.stem}</Text>
              {q.choices.map((c, idx) => (
                <TouchableOpacity key={idx} style={[styles.choice, answers[q.id] === idx && styles.choiceOn]} onPress={() => setAnswers((a) => ({ ...a, [q.id]: idx }))}>
                  <Text style={[styles.choiceT, answers[q.id] === idx && { color: C.teal, fontWeight: '700' }]}>{answers[q.id] === idx ? '◉' : '○'} {c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
          <TouchableOpacity style={[styles.primary, { marginTop: SP.lg }]} disabled={busy || answered === 0} onPress={submit}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryT}>제출하고 진단받기 ({answered}/{questions.length})</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPhase('intro')}><Text style={[styles.dim, { textAlign: 'center', marginTop: 10 }]}>취소</Text></TouchableOpacity>
        </>
      )}

      {phase === 'result' && result && (
        <>
          <View style={[ui.card, { marginTop: SP.md }]}>
            <Text style={styles.big}>{result.score}점 <Text style={styles.dim}>정답 {result.correct}/{result.total}</Text></Text>
          </View>
          <Text style={styles.secHead}>유형별 정답률</Text>
          {result.units.map((u) => (
            <View key={`${u.subject}-${u.unit}`} style={[ui.card, { marginBottom: 8 }]}>
              <View style={styles.row}>
                <Text style={styles.unitT}>{u.subject} · {u.unit}</Text>
                {u.weak && <Text style={styles.weak}>약점</Text>}
                <Text style={[styles.dim, { marginLeft: 'auto', color: u.weak ? '#dc2626' : C.muted }]}>{u.rate}% ({u.correct}/{u.total})</Text>
              </View>
              <View style={styles.barBg}><View style={{ width: `${u.rate}%`, height: '100%', borderRadius: 4, backgroundColor: u.weak ? '#dc2626' : C.teal }} /></View>
            </View>
          ))}
          {result.prescriptions.length > 0 && (
            <>
              <Text style={styles.secHead}>처방 — 이걸 먼저 보완하세요</Text>
              {result.prescriptions.map((p, i) => (
                <View key={i} style={[ui.card, { marginBottom: 8, borderLeftWidth: 3, borderLeftColor: C.teal }]}>
                  <Text style={styles.unitT}>{p.subject} · {p.unit} <Text style={styles.weak}>정답률 {p.rate}%</Text></Text>
                  <Text style={styles.action}>{p.action}</Text>
                  {onGoQna && (
                    <TouchableOpacity onPress={onGoQna}><Text style={{ color: C.teal, fontWeight: '700', fontSize: 13, marginTop: 6 }}>이 과목 질문하기 →</Text></TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity style={styles.primary} disabled={busy} onPress={startClinic}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryT}>🎯 약점만 다시 풀기</Text>}
              </TouchableOpacity>
            </>
          )}
          {result.prescriptions.length === 0 && <Text style={{ color: C.teal, fontSize: 13.5, marginTop: 12, fontWeight: '600' }}>약점 유형이 없어요 — 훌륭해요! 다른 과목도 진단해보세요.</Text>}
          <TouchableOpacity onPress={() => { setPhase('intro'); setResult(null); }}>
            <Text style={[styles.dim, { textAlign: 'center', marginTop: 14 }]}>다시 진단하기</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  sub: { fontSize: 12, color: C.muted, marginTop: 4 },
  lbl: { fontSize: 12.5, fontWeight: '700', color: C.muted, marginBottom: 6 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  pill: { borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  pillOn: { backgroundColor: C.teal, borderColor: C.teal },
  pillT: { fontSize: 13, color: C.muted, fontWeight: '700' },
  primary: { backgroundColor: C.teal, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  primaryT: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
  secT: { fontSize: 13, fontWeight: '800', color: C.ink },
  secHead: { fontSize: 13, fontWeight: '800', color: C.ink, marginTop: SP.lg, marginBottom: 8 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 96, marginTop: 10 },
  chartN: { fontSize: 10, color: C.muted },
  chartD: { fontSize: 9, color: C.caption },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  badge: { fontSize: 11.5, fontWeight: '700', color: C.teal, backgroundColor: C.teal50, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 9, overflow: 'hidden' },
  score: { fontSize: 14, fontWeight: '800', color: C.ink },
  dim: { fontSize: 12, color: C.muted },
  stem: { fontSize: 14, fontWeight: '600', color: C.ink, marginVertical: 8, lineHeight: 20 },
  choice: { borderWidth: 1, borderColor: C.lineSoft, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 6 },
  choiceOn: { borderColor: C.teal, backgroundColor: C.teal50 },
  choiceT: { fontSize: 13.5, color: C.ink },
  big: { fontSize: 26, fontWeight: '800', color: C.teal },
  unitT: { fontSize: 13.5, fontWeight: '700', color: C.ink },
  weak: { fontSize: 11, color: '#dc2626', fontWeight: '800' },
  barBg: { height: 6, borderRadius: 4, backgroundColor: C.lineSoft, overflow: 'hidden' },
  action: { fontSize: 13, color: C.ink, marginTop: 4, lineHeight: 19 },
});
