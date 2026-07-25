import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { SP, useTheme, useUI, type Palette } from '../theme';

/**
 * 성적 자가 입력(모바일) — 웹 StudentScoreInputPage 의 **수동 입력만** 이식한 화면.
 *
 * 왜 필요했나: 모바일에는 입력 경로가 아예 없어서(읽기 전용 ScoresScreen 뿐) 모바일 전용 학생은
 * 이번에 붙은 실행층 전체(과목별 격차·할 일 gap 자동 제안·목표 후보 밴드·회차 변동성)를 **영구히 빈 화면**으로만 봤다.
 * 그 화면들이 전부 성적(score_report)과 goal_avg 에 의존하기 때문이다.
 *
 * 의도적으로 뺀 것: OCR·성적표 스캔 — 업로드 경로는 생기부 노출 감지·차단 가드(O97)를 통과해야 하고
 * 모바일 업로드는 그 적용 표면이 아직 정리되지 않았다. 수동 입력이 먼저다.
 */
type Mode = 'nb' | 'std';
/** 표점 4종 — janus_score 계약(O43·C1)이 요구하는 조합. 영어·한국사는 절대평가라 등급으로 받는다. */
const STD_SUBJECTS = ['국어', '수학', '탐구1', '탐구2'] as const;
const GRADE_SUBJECTS = ['영어', '한국사'] as const;

export function ScoreInputScreen({ onBack }: { onBack: () => void }) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => makeStyles(C), [C]);

  const [mode, setMode] = useState<Mode>('nb');
  const [period, setPeriod] = useState('');
  const [gye, setGye] = useState<'이과' | '문과'>('이과');
  const [nb, setNb] = useState('');
  const [std, setStd] = useState<Record<string, string>>({});
  const [grades, setGrades] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // 기존 입력이 있으면 프리필 — 매번 처음부터 치게 하지 않는다.
  useEffect(() => {
    api.get<{ period?: string; gye?: string | null; nb?: number | null; items?: { subject: string; score?: number | null; grade?: string | null }[] }>('/scores/me')
      .then((r) => {
        if (!r) return;
        if (r.period) setPeriod(r.period);
        if (r.gye === '문과' || r.gye === '이과') setGye(r.gye);
        if (r.nb != null) { setNb(String(r.nb)); setMode('nb'); }
        const sc: Record<string, string> = {}; const gr: Record<string, string> = {};
        for (const it of r.items ?? []) {
          if (it.score != null) sc[it.subject] = String(it.score);
          if (it.grade) gr[it.subject] = String(it.grade);
        }
        if (Object.keys(sc).length) { setStd(sc); if (r.nb == null) setMode('std'); }
        if (Object.keys(gr).length) setGrades(gr);
      })
      .catch(() => { /* 첫 입력이면 없는 게 정상 */ });
  }, []);

  async function save() {
    setError(''); setMsg('');
    const p = period.trim();
    if (!p) { setError('시험(기간)을 입력하세요 — 예: 2026-09 모의고사'); return; }

    const items: { subject: string; score?: number; grade?: string }[] = [];
    for (const sub of GRADE_SUBJECTS) {
      const g = grades[sub]?.trim();
      if (g) items.push({ subject: sub, grade: g });
    }
    let nbVal: number | undefined;
    if (mode === 'nb') {
      const v = Number(nb);
      // 서버 DTO 와 같은 범위(0.01~99.99) — 여기서 막아야 400 왕복 없이 바로 알려줄 수 있다.
      if (!Number.isFinite(v) || v <= 0 || v >= 100) { setError('전국누백은 0.01~99.99 사이여야 해요.'); return; }
      nbVal = v;
    } else {
      for (const sub of STD_SUBJECTS) {
        const v = Number(std[sub]);
        if (!Number.isFinite(v)) { setError(`${sub} 표준점수를 입력하세요(표점 4종이 모두 필요해요).`); return; }
        items.push({ subject: sub, score: v });
      }
    }

    setBusy(true);
    try {
      await api.post('/scores/me', { period: p, examType: '수능/모의', mode, gye, nb: nbVal, items });
      setMsg('저장했어요 — 격차 리포트·과목별 격차·할 일에 바로 반영됩니다.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장 실패');
    } finally { setBusy(false); }
  }

  const num = (v: string, set: (n: string) => void, ph: string) => (
    <TextInput value={v} onChangeText={set} placeholder={ph} placeholderTextColor={C.caption} keyboardType="decimal-pad" style={ui.input} />
  );

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={{ color: C.teal, fontWeight: '700', marginBottom: 8 }}>‹ 마이</Text></TouchableOpacity>
      <Text style={ui.h}>성적진단</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>한 번 입력하면 배치표·격차 리포트·할 일이 함께 채워져요(성적 단일 규약).</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {msg ? <Text style={{ color: C.teal, fontSize: 13, marginBottom: 8 }}>{msg}</Text> : null}

      <View style={ui.card}>
        <Text style={ui.label}>시험(기간)</Text>
        <TextInput value={period} onChangeText={setPeriod} placeholder="예: 2026-09 모의고사" placeholderTextColor={C.caption} style={ui.input} maxLength={40} />

        <Text style={ui.label}>계열</Text>
        <View style={s.pills}>
          {(['이과', '문과'] as const).map((g) => (
            <TouchableOpacity key={g} onPress={() => setGye(g)} style={[s.pill, gye === g && s.pillOn]}>
              <Text style={[s.pillT, gye === g && { color: C.white }]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={ui.label}>입력 방식</Text>
        <View style={s.pills}>
          {([['nb', '전국누백'], ['std', '표준점수 4종']] as const).map(([v, l]) => (
            <TouchableOpacity key={v} onPress={() => setMode(v)} style={[s.pill, mode === v && s.pillOn]}>
              <Text style={[s.pillT, mode === v && { color: C.white }]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[ui.sub, { marginTop: 4 }]}>
          {mode === 'nb'
            ? '배치표에서 확인한 전국 누적백분위를 넣어요. 목표 대학 격차가 이 값으로 계산돼요.'
            : '표점 4종(국어·수학·탐구1·탐구2)이 모두 있어야 해요. 누백 환산은 배치표가 담당합니다.'}
        </Text>

        {mode === 'nb' ? (
          <>
            <Text style={ui.label}>전국누백 (%)</Text>
            {num(nb, setNb, '예: 2.3')}
          </>
        ) : (
          STD_SUBJECTS.map((sub) => (
            <View key={sub}>
              <Text style={ui.label}>{sub} 표준점수</Text>
              {num(std[sub] ?? '', (v) => setStd({ ...std, [sub]: v }), '예: 131')}
            </View>
          ))
        )}

        <Text style={[ui.label, { marginTop: 10 }]}>절대평가 등급 (선택)</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {GRADE_SUBJECTS.map((sub) => (
            <View key={sub} style={{ flex: 1 }}>
              <Text style={ui.sub}>{sub}</Text>
              {num(grades[sub] ?? '', (v) => setGrades({ ...grades, [sub]: v }), '1~9')}
            </View>
          ))}
        </View>

        <TouchableOpacity onPress={save} disabled={busy} style={[ui.btn, busy && ui.btnDisabled, { marginTop: 16 }]}>
          <Text style={ui.btnText}>{busy ? '저장 중…' : '저장 · 격차 반영'}</Text>
        </TouchableOpacity>
      </View>

      <View style={[ui.card, { marginTop: 12 }]}>
        <Text style={[ui.sub]}>
          성적표 사진 업로드(OCR)는 아직 웹에서만 지원해요 — 개인정보 보호 검사(생활기록부 노출 차단)를
          모바일 업로드 경로에 먼저 적용해야 해서예요.
        </Text>
      </View>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  pill: { borderWidth: 1, borderColor: C.inputBorder, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.white },
  pillOn: { backgroundColor: C.teal, borderColor: C.teal },
  pillT: { fontSize: 13, color: C.body, fontWeight: '600' },
});
