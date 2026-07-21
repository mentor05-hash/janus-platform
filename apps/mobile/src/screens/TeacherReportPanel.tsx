import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { SP, useTheme, type Palette } from '../theme';

/* 선생님 모바일 — 상담 기록(폴백 원천)에서 학생용/학부모용 2뷰 리포트 생성·검수·발송.
 * 웹 TeacherReportsPage 파리티. NoteEditor 하단에 임베드. 상담 기록을 먼저 저장해야 원천이 생긴다. */

type StudentView = { covered: string[]; reviewPoints: string[]; nextLearning: string[]; demo?: boolean };
type GuardianView = { progress: string; recommendedActions: string[]; effort: string; demo?: boolean };
type Views = { bookingId: string; status: string; source: string; sentAt: string | null; student: StudentView | null; guardian: GuardianView | null; guardianShared: boolean; demo: boolean };

const lines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean);
const STATUS_LABEL: Record<string, string> = { draft: '검수 대기', approved: '승인됨', sent: '발송됨' };

export function TeacherReportPanel({ bookingId }: { bookingId: string }) {
  const { C } = useTheme();
  const s = useMemo(() => mk(C), [C]);
  const [v, setV] = useState<Views | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // 편집 버퍼
  const [sCov, setSCov] = useState(''); const [sRev, setSRev] = useState(''); const [sNext, setSNext] = useState('');
  const [gProg, setGProg] = useState(''); const [gAct, setGAct] = useState(''); const [gEff, setGEff] = useState('');

  const fill = (x: Views) => {
    setSCov((x.student?.covered ?? []).join('\n')); setSRev((x.student?.reviewPoints ?? []).join('\n')); setSNext((x.student?.nextLearning ?? []).join('\n'));
    setGProg(x.guardian?.progress ?? ''); setGAct((x.guardian?.recommendedActions ?? []).join('\n')); setGEff(x.guardian?.effort ?? '');
  };
  const load = useCallback(() => {
    setLoading(true);
    api.get<Views>(`/media/reports/${bookingId}/views`)
      .then((x) => { setV(x); fill(x); })
      .catch(() => setV(null))
      .finally(() => setLoading(false));
  }, [bookingId]);
  useEffect(load, [load]);

  async function generate() {
    setBusy(true); setMsg('');
    try {
      const r = await api.post<{ origin: string; demo: boolean; guardianView?: boolean }>(`/media/reports/${bookingId}/views/generate`, {});
      setMsg(`요약을 만들었어요(원천: ${r.origin === 'audio' ? '녹음' : '상담 기록'}${r.demo ? ' · 데모, 검수 필요' : ''}).`);
      load();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : '생성 실패 — 상담 기록을 먼저 저장했는지 확인하세요.'); } finally { setBusy(false); }
  }
  async function saveView(audience: 'student' | 'guardian') {
    const patch = audience === 'student'
      ? { audience, covered: lines(sCov), reviewPoints: lines(sRev), nextLearning: lines(sNext) }
      : { audience, progress: gProg.trim(), recommendedActions: lines(gAct), effort: gEff.trim() };
    await api.patch(`/media/reports/${bookingId}/views`, patch);
  }
  async function approve() {
    setBusy(true); setMsg('');
    try {
      await saveView('student'); if (v?.guardian) await saveView('guardian');
      await api.post(`/media/reports/${bookingId}/views/approve`, {});
      setMsg('승인했어요. 발송하면 학생 계정에 노출됩니다.'); load();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : '승인 실패'); } finally { setBusy(false); }
  }
  async function send() {
    if (v?.status !== 'approved') return; // 승인 상태에서만 발송(중복 클릭 가드)
    setBusy(true); setMsg('');
    try {
      await api.post(`/media/reports/${bookingId}/views/send`, {});
      setV((prev) => (prev ? { ...prev, status: 'sent' } : prev)); // 낙관적 — 재조회 전이라도 발송 버튼 즉시 잠금
      setMsg('발송했어요.'); load();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : '발송 실패'); } finally { setBusy(false); }
  }

  const editable = v && v.status !== 'sent';
  const Field = ({ label, val, on }: { label: string; val: string; on: (t: string) => void }) => (
    <View style={{ marginBottom: 8 }}>
      <Text style={s.lbl}>{label}</Text>
      <TextInput style={[s.input, !editable && s.inputRO]} value={val} onChangeText={on} editable={!!editable} multiline placeholderTextColor={C.caption} />
    </View>
  );

  return (
    <View style={s.box}>
      <Text style={s.h}>📋 학생·학부모용 요약</Text>
      {loading ? <ActivityIndicator color={C.teal} style={{ marginVertical: 12 }} />
        : !v ? (
          <>
            <Text style={s.hint}>상담 기록(핵심요약)을 저장한 뒤, 학생용·학부모용 리포트를 만들 수 있어요.</Text>
            <TouchableOpacity disabled={busy} style={[s.btn, s.btnP]} onPress={generate}><Text style={s.btnPT}>✨ 요약 만들기</Text></TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={s.meta}>원천 {v.source === 'audio' ? '녹음' : '상담 기록'} · {STATUS_LABEL[v.status] ?? v.status}{v.sentAt ? ' · 발송됨' : ''}{v.demo && v.status !== 'sent' ? ' · ⚠데모(검수 필요)' : ''}</Text>
            <Text style={s.sub}>🎓 학생용</Text>
            <Field label="오늘 다룬 내용" val={sCov} on={setSCov} />
            <Field label="복습 포인트" val={sRev} on={setSRev} />
            <Field label="다음 학습" val={sNext} on={setSNext} />
            {v.guardian ? (
              <>
                <Text style={s.sub}>👪 학부모용 <Text style={s.note}>(가격·상품 단정 없이 "권장"까지)</Text></Text>
                <Field label="진척 요지" val={gProg} on={setGProg} />
                <Field label="권장 다음 액션" val={gAct} on={setGAct} />
                <Field label="소요·권장 안내" val={gEff} on={setGEff} />
              </>
            ) : <Text style={s.note}>· 이 상담 기록은 ‘보호자 비공개’라 학부모용 뷰는 만들지 않았어요.</Text>}
            {editable ? (
              <View style={s.acts}>
                <TouchableOpacity disabled={busy} style={[s.btn, s.btnG]} onPress={generate}><Text style={s.btnGT}>재생성</Text></TouchableOpacity>
                {v.status === 'draft' && <TouchableOpacity disabled={busy} style={[s.btn, s.btnP]} onPress={approve}><Text style={s.btnPT}>승인</Text></TouchableOpacity>}
                {v.status === 'approved' && <TouchableOpacity disabled={busy} style={[s.btn, s.btnP]} onPress={send}><Text style={s.btnPT}>{busy ? '발송 중…' : '📤 발송'}</Text></TouchableOpacity>}
              </View>
            ) : <Text style={s.sent}>발송 완료{v.guardianShared ? ' · 학생이 학부모에게 공유함' : ''}</Text>}
          </>
        )}
      {msg ? <Text style={s.msg}>{msg}</Text> : null}
    </View>
  );
}

const mk = (C: Palette) => StyleSheet.create({
  box: { borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 14, marginTop: SP.md, backgroundColor: C.white },
  h: { fontSize: 14, fontWeight: '800', color: C.ink, marginBottom: 6 },
  hint: { fontSize: 12.5, color: C.muted, marginBottom: 10, lineHeight: 18 },
  meta: { fontSize: 11.5, color: C.caption, marginBottom: 10 },
  sub: { fontSize: 13, fontWeight: '800', color: C.ink, marginTop: 8, marginBottom: 6 },
  note: { fontSize: 11.5, color: C.caption, fontWeight: '400' },
  lbl: { fontSize: 12, fontWeight: '700', color: C.muted, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 9, fontSize: 13.5, color: C.ink, minHeight: 40, textAlignVertical: 'top' },
  inputRO: { backgroundColor: C.bg, color: C.muted },
  acts: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: { flex: 1, borderRadius: 9, paddingVertical: 11, alignItems: 'center' },
  btnP: { backgroundColor: C.teal }, btnPT: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
  btnG: { borderWidth: 1, borderColor: C.line }, btnGT: { color: C.muted, fontWeight: '700', fontSize: 13.5 },
  sent: { fontSize: 12.5, color: C.done, fontWeight: '600', marginTop: 8 },
  msg: { fontSize: 12.5, color: C.teal, marginTop: 8, fontWeight: '600' },
});
