import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError } from '../api';
import { R, SP, useTheme, useUI, type Palette } from '../theme';
import { ScoreTrendView, type Trend } from './ScoreTrendView';

type ClinicAttempt = { id: string; total: number; correct: number; score: number; submittedAt: string };
type ClinicSummary = { attempts: ClinicAttempt[]; count: number; avgScore: number | null; bestScore: number | null; improvement: number | null };
const fmtDate = (s: string) => { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()}`; };

/** 학생 본인 성적·배치 추이(정책 노출 시) + 약점 클리닉 추이. */
export function ScoresScreen({ onBack, showPlacement, backLabel = '‹ 뒤로' }: { onBack: () => void; showPlacement: boolean; backLabel?: string }) {
  const { C } = useTheme();
  const ui = useUI();
  const s = useMemo(() => makeStyles(C), [C]);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [clinic, setClinic] = useState<ClinicSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Trend>('/me/scores/trend').then(setTrend).catch((e) => setError(e instanceof ApiError ? e.message : '조회 실패'));
    api.get<ClinicSummary>('/diagnostics/clinics').then(setClinic).catch(() => { /* 진단 미이용 시 무시 */ });
  }, []);

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack}><Text style={{ color: C.teal, fontWeight: '700', marginBottom: 8 }}>{backLabel}</Text></TouchableOpacity>
      <Text style={ui.h}>내 성적·배치</Text>
      <Text style={[ui.sub, { marginBottom: SP.md }]}>회차별 성적 추이와 예상 대학·학과 라인 변화를 확인하세요.</Text>
      {error ? <Text style={ui.error}>{error}</Text> : null}
      {trend === null ? <Text style={ui.sub}>불러오는 중…</Text> : (
        <View style={[ui.card]}>
          <ScoreTrendView trend={trend} showPlacement={showPlacement} />
        </View>
      )}

      {clinic && clinic.count >= 1 && (
        <View style={[ui.card, { marginTop: SP.md, borderLeftWidth: 3, borderLeftColor: C.blue }]}>
          <View style={s.head}>
            <Text style={s.title}>🎯 약점 클리닉 추이</Text>
            <View style={s.pill}><Text style={s.pillT}>{clinic.count}회</Text></View>
            {clinic.improvement != null && clinic.count >= 2 && (
              <Text style={[s.imp, { color: clinic.improvement > 0 ? C.done : clinic.improvement < 0 ? C.danger : C.muted }]}>
                {clinic.improvement > 0 ? `▲ +${clinic.improvement}점` : clinic.improvement < 0 ? `▼ ${clinic.improvement}점` : '변화 없음'}
              </Text>
            )}
          </View>
          <View style={s.statRow}>
            <View><Text style={s.statL}>평균</Text><Text style={[s.statV, { color: C.blue }]}>{clinic.avgScore ?? '—'}점</Text></View>
            <View><Text style={s.statL}>최고</Text><Text style={[s.statV, { color: C.ink }]}>{clinic.bestScore ?? '—'}점</Text></View>
          </View>
          {clinic.attempts.length >= 2 ? (
            <View style={s.bars}>
              {clinic.attempts.slice(-10).map((a) => (
                <View key={a.id} style={s.barCol}>
                  <Text style={s.barVal}>{a.score}</Text>
                  <View style={[s.bar, { height: Math.max(4, a.score * 0.5), backgroundColor: a.score >= 60 ? C.blue : C.danger }]} />
                  <Text style={s.barDate}>{fmtDate(a.submittedAt)}</Text>
                </View>
              ))}
            </View>
          ) : <Text style={[ui.sub, { marginTop: 4 }]}>클리닉을 반복하면 점수 변화를 추적해드려요.</Text>}
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  title: { fontSize: 14, fontWeight: '800', color: C.ink },
  pill: { backgroundColor: C.fill, borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 2 },
  pillT: { fontSize: 11, fontWeight: '700', color: C.muted },
  imp: { marginLeft: 'auto', fontSize: 12.5, fontWeight: '700' },
  statRow: { flexDirection: 'row', gap: 20, marginBottom: 10 },
  statL: { fontSize: 11, color: C.caption },
  statV: { fontSize: 18, fontWeight: '800' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 80 },
  barCol: { flex: 1, alignItems: 'center', gap: 3 },
  barVal: { fontSize: 10, color: C.muted },
  bar: { width: '100%', maxWidth: 26, borderRadius: 4 },
  barDate: { fontSize: 9, color: C.caption },
});
